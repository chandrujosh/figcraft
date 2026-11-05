import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import type { AnimationSequence, AnimProperty, Breakpoint, Keyframe, LayerItem, PropertyTrack, StudioProject, TriggerType } from "./model";
import { createSequence, createTrack, EASINGS, makeId, makeSampleHtml, prepareHtml, PROPERTY_GROUPS, PROPERTY_META, TRIGGER_GROUPS } from "./model";
import { mountAnimations, type AnimationController } from "./runtime";

type Tab = "Trigger" | "Animate" | "Timeline" | "Motion" | "Advanced";
const STORAGE_KEY = "figcraft-motion-studio-v1";
const DEMO: StudioProject = { version: 1, name: "Motion Studio Demo", html: prepareHtml(makeSampleHtml()), sequences: [] };

const PRESETS: { group: string; name: string; property: AnimProperty; from: number | string; to: number | string; ease: string }[] = [
  {group:"Entrance",name:"Fade In",property:"opacity",from:0,to:100,ease:"power2.out"},
  {group:"Entrance",name:"Fade Up",property:"y",from:64,to:0,ease:"power3.out"},
  {group:"Entrance",name:"Fade Down",property:"y",from:-64,to:0,ease:"power3.out"},
  {group:"Entrance",name:"Fade Left",property:"x",from:80,to:0,ease:"power3.out"},
  {group:"Entrance",name:"Fade Right",property:"x",from:-80,to:0,ease:"power3.out"},
  {group:"Entrance",name:"Zoom In",property:"scaleX",from:0.72,to:1,ease:"power3.out"},
  {group:"Entrance",name:"Zoom Out",property:"scaleX",from:1.2,to:1,ease:"power3.out"},
  {group:"Entrance",name:"Rotate In",property:"rotation",from:-16,to:0,ease:"back.out(1.7)"},
  {group:"Entrance",name:"Blur In",property:"blur",from:18,to:0,ease:"power2.out"},
  {group:"Text",name:"Word Reveal",property:"textReveal",from:"words",to:"words",ease:"power3.out"},
  {group:"Text",name:"Character Reveal",property:"textReveal",from:"characters",to:"characters",ease:"power3.out"},
  {group:"Image",name:"Image Reveal",property:"clipPath",from:"inset(0 0 100% 0)",to:"inset(0 0 0% 0)",ease:"power3.inOut"},
  {group:"Image",name:"Zoom Reveal",property:"scaleX",from:1.16,to:1,ease:"power2.out"},
  {group:"Interaction",name:"Hover Scale",property:"scaleX",from:1,to:1.06,ease:"power2.out"},
  {group:"Interaction",name:"Hover Lift",property:"y",from:0,to:-8,ease:"power2.out"},
  {group:"Scroll",name:"Scroll Fade",property:"opacity",from:0,to:100,ease:"none"},
  {group:"Scroll",name:"Scroll Parallax",property:"y",from:80,to:-80,ease:"none"},
  {group:"Scroll",name:"Scroll Zoom",property:"scaleX",from:0.8,to:1,ease:"none"}
];

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function selectorFor(id: string) { return `[data-avab-id="${CSS.escape(id)}"]`; }
function serializeFrame(frame: HTMLIFrameElement): string {
  const source=frame.contentDocument;
  if(!source)return "";
  const root=source.documentElement.cloneNode(true) as HTMLElement;
  root.querySelector("#avab-editor-style")?.remove();
  root.querySelectorAll("[data-avab-selected]").forEach(el=>el.removeAttribute("data-avab-selected"));
  return "<!doctype html>\\n"+root.outerHTML;
}
function fileName(name: string) { return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "motion-project"; }

export default function App() {
  const [project, setProject] = useState<StudioProject>(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as StudioProject : DEMO; } catch { return DEMO; }
  });
  const [selected, setSelected] = useState("layer-1");
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<LayerItem | null>(null);
  const [activeSequenceId, setActiveSequenceId] = useState("");
  const [activeTrackId, setActiveTrackId] = useState("");
  const [tab, setTab] = useState<Tab>("Trigger");
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  const [previewMode, setPreviewMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [htmlInputOpen, setHtmlInputOpen] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [renaming, setRenaming] = useState("");
  const [status, setStatus] = useState("Ready");
  const [undoStack, setUndoStack] = useState<StudioProject[]>([]);
  const [redoStack, setRedoStack] = useState<StudioProject[]>([]);
  const [dirty, setDirty] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef(project);
  const selectedRef = useRef(selected);
  const previewModeRef = useRef(previewMode);
  const controllerRef = useRef<AnimationController | null>(null);
  const currentSequence = project.sequences.find(s => s.id === activeSequenceId) ?? project.sequences[0];
  const currentTrack = currentSequence?.tracks.find(t => t.id === activeTrackId) ?? currentSequence?.tracks[0];
  const duration = useMemo(() => Math.max(1, ...project.sequences.flatMap(s => s.tracks.flatMap(t => t.keyframes.map(k => k.at + t.startTime)))), [project.sequences]);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { selectedRef.current = selected; previewModeRef.current = previewMode; }, [selected, previewMode]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      setDirty(false);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project]);

  const commit = useCallback((mutate: (draft: StudioProject) => void, label = "Changes saved") => {
    const before = clone(projectRef.current);
    const next = clone(projectRef.current);
    mutate(next);
    setUndoStack(stack => [...stack.slice(-39), before]);
    setRedoStack([]);
    projectRef.current = next;
    setProject(next);
    setDirty(true);
    setStatus(label);
  }, []);

  const refreshLayers = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const next: LayerItem[] = [];
    const root = doc.body;
    const walk = (parent: Element, depth: number) => {
      [...parent.children].forEach((el) => {
        if (["SCRIPT","STYLE","LINK","META","TITLE"].includes(el.tagName)) return;
        const id = el.getAttribute("data-avab-id") || makeId("layer");
        el.setAttribute("data-avab-id", id);
        const text = el.getAttribute("data-avab-name") || el.textContent?.trim().replace(/\s+/g," ").slice(0,35) || el.tagName.toLowerCase();
        next.push({id,name:text,tag:el.tagName.toLowerCase(),depth,parent:parent.getAttribute("data-avab-id") || "body",className:typeof el.className==="string"?el.className:""});
        walk(el, depth+1);
      });
    };
    walk(root,0);
    setLayers(next);
    setSelectedLayer(next.find(l=>l.id===selectedRef.current) ?? null);
  }, []);

  const refreshPreview = useCallback(() => {
    const frame=iframeRef.current;
    if (!frame) return;
    const doc=frame.contentDocument;
    if (!doc) return;
    doc.open(); doc.write(projectRef.current.html); doc.close();
    const inject=() => {
      const d=frame.contentDocument;
      if(!d) return;
      d.querySelectorAll("[data-avab-id]").forEach(el=>el.addEventListener("click", e=>{
        if(previewModeRef.current) return;
        e.preventDefault(); e.stopPropagation();
        const id=(el as HTMLElement).dataset.avabId;
        if(id) window.postMessage({type:"AVAB_SELECT",id},"*");
      },true));
      d.addEventListener("pointerdown",e=>{
        if(previewModeRef.current) return;
        const target=e.target instanceof Element?e.target.closest("[data-avab-id]"):null;
        if(!target) return;
        const id=target.getAttribute("data-avab-id");
        if(id) window.postMessage({type:"AVAB_SELECT",id},"*");
      },true);
      d.addEventListener("click",e=>{
        if(previewModeRef.current) return;
        if((e.target as Element)?.closest("[data-avab-id]")) e.preventDefault();
      },true);
      const style=d.createElement("style");
      style.id="avab-editor-style";
      style.textContent=`[data-avab-id]{cursor:${previewModeRef.current?"auto":"crosshair"}!important;outline:1px dashed transparent;outline-offset:2px}[data-avab-id]:hover{outline-color:${previewModeRef.current?"transparent":"rgba(151,203,255,.65)"}!important}[data-avab-selected="true"]{outline:2px solid #d7f75b!important}`;
      d.head.appendChild(style);
      const el=d.querySelector(selectorFor(selectedRef.current));
      el?.setAttribute("data-avab-selected","true");
      refreshLayers();
    };
    frame.contentWindow?.setTimeout(inject, 0);
  }, []);

  useEffect(()=>{ refreshPreview(); },[project.html,refreshPreview]);

  useEffect(()=>{
    const onMessage=(event:MessageEvent)=>{
      if(event.data?.type==="AVAB_SELECT" && typeof event.data.id==="string") {
        setSelected(event.data.id);
        setSelectedLayer(layers.find(l=>l.id===event.data.id)??null);
      }
    };
    window.addEventListener("message",onMessage);
    return()=>window.removeEventListener("message",onMessage);
  },[layers]);

  useEffect(()=>{
    const doc=iframeRef.current?.contentDocument;
    if(!doc) return;
    doc.querySelectorAll("[data-avab-selected]").forEach(el=>el.removeAttribute("data-avab-selected"));
    const el=doc.querySelector(selectorFor(selected));
    el?.setAttribute("data-avab-selected","true");
    const style=doc.getElementById("avab-editor-style");
    if(style) style.textContent=`[data-avab-id]{cursor:${previewMode?"auto":"crosshair"}!important;outline:1px dashed transparent;outline-offset:2px}[data-avab-id]:hover{outline-color:${previewMode?"transparent":"rgba(151,203,255,.65)"}!important}[data-avab-selected="true"]{outline:2px solid #d7f75b!important}`;
    if(previewMode) doc.body.classList.add("avab-preview"); else doc.body.classList.remove("avab-preview");
  },[selected,previewMode,project.html]);

  const stopEngine=useCallback(()=>{controllerRef.current?.destroy();controllerRef.current=null;setPlaying(false);},[]);
  const rebuildEngine=useCallback(()=>{
    stopEngine();
    const doc=iframeRef.current?.contentDocument;
    const win=iframeRef.current?.contentWindow;
    if(!doc||!win||!previewMode) return;
    try{
      controllerRef.current=mountAnimations(projectRef.current,doc,win,{
        onSequenceStart:id=>setStatus(`Playing: ${projectRef.current.sequences.find(s=>s.id===id)?.name??"Sequence"}`),
        onSequenceComplete:id=>setStatus(`Completed: ${projectRef.current.sequences.find(s=>s.id===id)?.name??"Sequence"}`),
        onWarning:setWarnings
      });
      setWarnings(controllerRef.current.warnings);
      setStatus("Preview active · GSAP runtime connected");
      setPlaying(true);
    }catch(err){setStatus(`Preview error: ${String(err)}`);}
  },[previewMode,stopEngine]);

  useEffect(()=>{ if(previewMode) rebuildEngine(); else stopEngine(); return()=>stopEngine(); },[previewMode,rebuildEngine,stopEngine,project.sequences,project.html]);

  const updateSequence=useCallback((patch: Partial<AnimationSequence>)=>{
    if(!currentSequence) return;
    commit(d=>{const s=d.sequences.find(x=>x.id===currentSequence.id);if(s)Object.assign(s,patch);});
  },[currentSequence,commit]);
  const updateTrigger=useCallback((patch: Partial<AnimationSequence["trigger"]>)=>{
    if(!currentSequence)return;
    updateSequence({trigger:{...currentSequence.trigger,...patch}});
  },[currentSequence,updateSequence]);
  const updateMotion=useCallback((patch: Partial<AnimationSequence["motion"]>)=>{
    if(!currentSequence)return;
    updateSequence({motion:{...currentSequence.motion,...patch}});
  },[currentSequence,updateSequence]);
  const updateTrack=(patch:Partial<PropertyTrack>)=>{
    if(!currentSequence||!currentTrack)return;
    commit(d=>{const t=d.sequences.find(s=>s.id===currentSequence.id)?.tracks.find(x=>x.id===currentTrack.id);if(t)Object.assign(t,patch);});
  };
  const addSequence=(type:TriggerType="scrollIntoView")=>{
    const s=createSequence(`Animation ${project.sequences.length+1}`,type);
    s.trigger.target=selectorFor(selected);
    commit(d=>d.sequences.push(s),"New animation created");
    setActiveSequenceId(s.id);setActiveTrackId("");setTab("Trigger");
  };
  const addTrack=(property:AnimProperty)=>{
    if(!currentSequence)return;
    const selector=selectorFor(selected);
    const track=createTrack(property,selector,currentSequence.motion.duration);
    commit(d=>d.sequences.find(s=>s.id===currentSequence.id)?.tracks.push(track),"Animation action added");
    setActiveTrackId(track.id);setTab("Animate");
  };
  const updateKeyframe=(trackId:string,keyId:string,patch:Partial<Keyframe>)=>{
    if(!currentSequence)return;
    commit(d=>{const t=d.sequences.find(s=>s.id===currentSequence.id)?.tracks.find(x=>x.id===trackId);const k=t?.keyframes.find(x=>x.id===keyId);if(k)Object.assign(k,patch);});
  };
  const addKeyframe=()=>{
    if(!currentSequence||!currentTrack)return;
    const at=Math.max(0,playhead);
    const last=currentTrack.keyframes[currentTrack.keyframes.length-1];
    const key:Keyframe={id:makeId("kf"),at,value:last?.value??0,ease:"power2.out"};
    commit(d=>d.sequences.find(s=>s.id===currentSequence.id)?.tracks.find(t=>t.id===currentTrack.id)?.keyframes.push(key),"Keyframe added");
  };
  const removeTrack=()=>{
    if(!currentSequence||!currentTrack)return;
    commit(d=>{const s=d.sequences.find(x=>x.id===currentSequence.id);if(s)s.tracks=s.tracks.filter(t=>t.id!==currentTrack.id);});
    setActiveTrackId("");
  };
  const applyPreset=(preset:typeof PRESETS[number])=>{
    if(!currentSequence){addSequence("scrollIntoView");return;}
    const track=createTrack(preset.property,selectorFor(selected),currentSequence.motion.duration);
    track.label=preset.name;
    track.keyframes[0].value=preset.from;track.keyframes[1].value=preset.to;
    track.keyframes.forEach(k=>k.ease=preset.ease);
    commit(d=>d.sequences.find(s=>s.id===currentSequence.id)?.tracks.push(track),`Preset applied: ${preset.name}`);
    setActiveTrackId(track.id);setShowPresets(false);setTab("Animate");
  };

  const importHtml=async(file:File)=>{
    try{
      let content="";
      if(file.name.toLowerCase().endsWith(".zip")){
        const zip=await JSZip.loadAsync(file);
        const entry=Object.values(zip.files).find(f=>!f.dir&&/\.html?$/i.test(f.name));
        if(!entry)throw new Error("ZIP contains no HTML entry file");
        content=await entry.async("string");
      }else content=await file.text();
      const html=prepareHtml(content);
      commit(d=>{d.html=html;d.name=file.name.replace(/\.(html?|zip)$/i,"");d.sequences=[];},"Website imported");
      setTimeout(refreshPreview,80);
      setStatus("Website imported · Select an element to animate");
    }catch(err){setStatus(`Import failed: ${String(err)}`);}
  };
  const importProject=async(file:File)=>{
    try{
      const data=JSON.parse(await file.text()) as StudioProject;
      if(data.version!==1||typeof data.html!=="string"||!Array.isArray(data.sequences))throw new Error("Unsupported animation project format");
      data.html=prepareHtml(data.html);
      setProject(data);projectRef.current=data;setSelected("layer-1");setActiveSequenceId(data.sequences[0]?.id??"");setActiveTrackId("");
      setUndoStack([]);setRedoStack([]);setStatus("Project imported");
    }catch(err){setStatus(`Project import failed: ${String(err)}`);}
  };
  const undo=()=>{const prev=undoStack.at(-1);if(!prev)return;setRedoStack(x=>[...x,clone(project)]);setUndoStack(x=>x.slice(0,-1));setProject(prev);projectRef.current=prev;setStatus("Undo");};
  const redo=()=>{const next=redoStack.at(-1);if(!next)return;setUndoStack(x=>[...x,clone(project)]);setRedoStack(x=>x.slice(0,-1));setProject(next);projectRef.current=next;setStatus("Redo");};
  const exportProject=()=>{
    const blob=new Blob([JSON.stringify(project,null,2)],{type:"application/json"});
    download(blob,`${fileName(project.name)}.motion.json`);
  };
  const exportWebsite=async()=>{
    const zip=new JSZip();
    const site=project.html.replace("</body>",`<script src="./motion-runtime.js"></script><script>window.addEventListener("DOMContentLoaded",()=>window.FigCraftMotion?.mount("./motion-project.json"));</script></body>`);
    zip.file("index.html",site);
    zip.file("motion-project.json",JSON.stringify(project,null,2));
    zip.file("motion-runtime.js",exportRuntimeSource());
    zip.file("README.md",`# ${project.name}\n\nThis export uses GSAP and ScrollTrigger from jsDelivr. Keep an internet connection or vendor those libraries locally for offline hosting.\n\n1. Upload the contents of this folder to your web host.\n2. Open index.html.\n3. Animation settings are in motion-project.json.\n\nGenerated by FigCraft Motion Studio.\n`);
    const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
    download(blob,`${fileName(project.name)}-website.zip`);
    setStatus("Website package exported");
  };
  const exportRuntimeSource=()=>`(function(){\n  const s=document.createElement('script');\n  s.type='module';\n  s.textContent = \`import {gsap} from 'https://cdn.jsdelivr.net/npm/gsap@3.13.0/index.js'; import {ScrollTrigger} from 'https://cdn.jsdelivr.net/npm/gsap@3.13.0/ScrollTrigger.js'; gsap.registerPlugin(ScrollTrigger); fetch('./motion-project.json').then(r=>r.json()).then(project=>{ const all=[]; const target=(sel)=>{try{return [...document.querySelectorAll(sel)]}catch{return []}}; for(const seq of project.sequences){if(!seq.enabled)continue; const trig=seq.trigger; const root=target(trig.target)[0]||document.body; const tl=gsap.timeline({paused:true,repeat:seq.motion.repeat,repeatDelay:seq.motion.repeatDelay,yoyo:seq.motion.yoyo,delay:seq.motion.delay}); for(const track of seq.tracks){if(!track.enabled)continue; const nodes=target(track.target||trig.target); if(!nodes.length)continue; const ks=[...track.keyframes].sort((a,b)=>a.at-b.at); for(let i=1;i<ks.length;i++){const prev=ks[i-1],next=ks[i]; const prop=track.property; const cv=v=>prop==='opacity'?Number(v)/100:prop==='blur'?\`blur(\${v}px)\`:v; const a={ [prop==='x'?'x':prop==='y'?'y':prop==='rotation'?'rotation':prop==='scaleX'?'scaleX':prop==='scaleY'?'scaleY':prop]:cv(prev.value)}; const b={ [prop==='x'?'x':prop==='y'?'y':prop==='rotation'?'rotation':prop==='scaleX'?'scaleX':prop==='scaleY'?'scaleY':prop]:cv(next.value),duration:Math.max(.01,next.at-prev.at),ease:next.ease||'power2.out'}; tl.fromTo(nodes,a,b,prev.at); }} const st=trig.type.includes('scroll')||trig.type==='whileScrollingInView'||trig.type==='pageScrolled'; if(st){const scr=trig.scrub||trig.type==='scrollProgress'||trig.type==='whileScrollingInView'||trig.type==='pageScrolling';tl.scrollTrigger={trigger:root,start:trig.start,end:trig.end,scrub:scr?(trig.smoothing||true):false,pin:trig.pin,pinSpacing:trig.pinSpacing,toggleActions:trig.toggleActions,markers:trig.markers,snap:trig.snap?trig.snap:false};} if(st){tl.scrollTrigger=undefined;const inst=ScrollTrigger.create({trigger:root,start:trig.start,end:trig.end,animation:tl,scrub:trig.scrub?Math.max(.01,trig.smoothing):false,pin:trig.pin?target(trig.pinTarget)[0]||root:false,pinSpacing:trig.pinSpacing,toggleActions:trig.toggleActions,markers:trig.markers,snap:trig.snap?{snapTo:1/trig.snap,duration:.25}:false,onUpdate:self=>{if((trig.type==='scrollDown'&&self.direction>0)||(trig.type==='scrollUp'&&self.direction<0))tl.play();}});all.push(()=>inst.kill());}else{const fire=()=>tl.restart();const ev=({elementClick:'click',buttonClick:'click',elementHover:'mouseenter',mouseEnter:'mouseenter',mouseLeave:'mouseleave',doubleClick:'dblclick',pointerDown:'pointerdown',pointerUp:'pointerup'})[trig.type];if(ev){root.addEventListener(ev,fire);all.push(()=>root.removeEventListener(ev,fire));}else if(trig.type==='customEvent'){const f=()=>tl.restart();window.addEventListener(trig.eventName||'studio:animate',f);all.push(()=>window.removeEventListener(trig.eventName||'studio:animate',f));}else if(['pageLoad','afterPageLoad','pageReady','delay'].includes(trig.type)){const f=()=>trig.type==='delay'?setTimeout(fire,trig.delay):fire();if(document.readyState==='complete')f();else window.addEventListener('load',f,{once:true});all.push(()=>window.removeEventListener('load',f));}} } window.addEventListener('beforeunload',()=>all.forEach(k=>k()));});\`; document.head.appendChild(s);\n})();\n`;
  const togglePreview=()=>{
    if(!previewMode){setPreviewMode(true);setStatus("Starting live preview");}
    else{stopEngine();setPreviewMode(false);setStatus("Editor mode");}
  };
  const renameLayer=(id:string,name:string)=>{
    const doc=iframeRef.current?.contentDocument,el=doc?.querySelector(selectorFor(id));
    if(!el||!name.trim())return;
    el.setAttribute("data-avab-name",name.trim());refreshLayers();
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layer renamed");
  };
  const toggleLayer=(id:string,kind:"hidden"|"locked")=>{
    const el=iframeRef.current?.contentDocument?.querySelector(selectorFor(id)) as HTMLElement|null;
    if(!el)return;
    if(kind==="hidden")el.style.display=el.style.display==="none"?"":"none";
    else el.style.pointerEvents=el.style.pointerEvents==="none"?"":"none";
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},kind==="hidden"?"Layer visibility changed":"Layer lock toggled");
  };
  const moveLayer=(id:string,direction:-1|1)=>{
    const el=iframeRef.current?.contentDocument?.querySelector(selectorFor(id));
    if(!el?.parentElement)return;
    const siblings=[...el.parentElement.children],i=siblings.indexOf(el);
    if(direction<0&&i>0)el.parentElement.insertBefore(el,siblings[i-1]);
    if(direction>0&&i<siblings.length-1)el.parentElement.insertBefore(siblings[i+1],el);
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layer order changed");refreshLayers();
  };
  const duplicateLayer=(id:string)=>{
    const el=iframeRef.current?.contentDocument?.querySelector(selectorFor(id));
    if(!el?.parentElement)return;
    const copy=el.cloneNode(true) as HTMLElement;
    const newId=makeId("layer");copy.setAttribute("data-avab-id",newId);copy.setAttribute("data-avab-name",`${el.getAttribute("data-avab-name")||el.tagName} copy`);
    el.parentElement.insertBefore(copy,el.nextSibling);
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layer duplicated");setSelected(newId);refreshLayers();
  };
  const groupLayer=(id:string)=>{
    const el=iframeRef.current?.contentDocument?.querySelector(selectorFor(id));
    if(!el?.parentElement)return;
    const wrapper=iframeRef.current!.contentDocument!.createElement("div");
    wrapper.setAttribute("data-avab-id",makeId("group"));wrapper.setAttribute("data-avab-name","Group");
    el.parentElement.insertBefore(wrapper,el);wrapper.appendChild(el);
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layer grouped");refreshLayers();
  };
  const scrub=(value:number)=>{
    setPlayhead(value);
    controllerRef.current?.seek(currentSequence?.id??"",value);
  };
  const readCss=(property:string)=>{
    const el=iframeRef.current?.contentDocument?.querySelector(selectorFor(selected)) as HTMLElement|null;
    if(!el)return property==="position"?"static":"auto";
    const inline=el.style.getPropertyValue(property);
    return inline||iframeRef.current?.contentWindow?.getComputedStyle(el).getPropertyValue(property)||"auto";
  };
  const writeCss=(property:string,value:string)=>{
    const frame=iframeRef.current,el=frame?.contentDocument?.querySelector(selectorFor(selected)) as HTMLElement|null;
    if(!frame||!el)return;
    if(value==="auto"||value==="")el.style.removeProperty(property);else el.style.setProperty(property,value);
    const html=serializeFrame(frame);
    commit(d=>{d.html=html;},`CSS ${property} updated`);
  };
  const switchBreakpoint=(bp:Breakpoint)=>{
    setBreakpoint(bp);
    const frame=iframeRef.current;
    if(!frame)return;
    frame.style.width=bp==="desktop"?"100%":bp==="tablet"?"768px":"390px";
    frame.style.maxWidth="100%";
    controllerRef.current?.refresh();
  };

  return <div className="studio">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-icon">F<span>✳</span></div><div><b>FIGCRAFT</b><small>MOTION STUDIO <i>V1.0</i></small></div></div>
      <div className="top-actions">
        <button className="top-btn" onClick={undo} disabled={!undoStack.length} title="Undo">↶</button>
        <button className="top-btn" onClick={redo} disabled={!redoStack.length} title="Redo">↷</button>
        <span className="top-sep"/>
        <button className="top-btn" onClick={()=>fileRef.current?.click()}>⇧ Import</button>
        <input ref={fileRef} type="file" hidden accept=".html,.htm,.zip,.json,.motion.json" onChange={e=>{const f=e.target.files?.[0];if(f){if(f.name.endsWith(".json"))void importProject(f);else void importHtml(f);}e.currentTarget.value="";}}/>
        <button className="top-btn" onClick={exportProject}>Export project</button>
        <button className="top-btn" onClick={()=>void exportWebsite()}>Export website ↗</button>
        <span className="top-sep"/>
        <button className={previewMode?"preview-btn is-live":"preview-btn"} onClick={togglePreview}>{previewMode?"■ Stop preview":"▶ Preview"}</button>
      </div>
    </header>
    <div className="subbar">
      <div className="project-name"><span className="live-dot"/> <input value={project.name} onChange={e=>commit(d=>{d.name=e.target.value;})}/><small>{dirty?"Saving…":"All changes saved"}</small></div>
      <div className="responsive-switch">
        {(["desktop","tablet","mobile"] as Breakpoint[]).map(bp=><button key={bp} className={breakpoint===bp?"active":""} onClick={()=>switchBreakpoint(bp)} title={bp}><span>{bp==="desktop"?"▰":bp==="tablet"?"▯":"▯"}</span>{bp}</button>)}
      </div>
      <div className="sub-actions"><button onClick={()=>{setHtmlDraft(project.html);setHtmlInputOpen(true);}}>Edit HTML source</button><span>⌘ / Ctrl + S autosave</span></div>
    </div>
    <main className="layout">
      <aside className="left-panel">
        <div className="panel-tabs"><b>Structure</b><button onClick={refreshLayers}>⟳</button></div>
        <div className="panel-section-title"><span>LAYERS</span><span>{layers.length} elements</span></div>
        <div className="layers-list">
          {layers.map(layer=><div key={layer.id} className={"layer-row "+(selected===layer.id?"selected":"")} style={{paddingLeft:10+layer.depth*12}} onClick={()=>setSelected(layer.id)}>
            <span className="layer-type">{layer.tag==="img"?"▧":layer.tag==="svg"?"◇":layer.tag.startsWith("h")?"T":layer.tag==="button"?"▱":"▣"}</span>
            {renaming===layer.id?<input autoFocus value={layer.name} onChange={e=>setLayers(old=>old.map(x=>x.id===layer.id?{...x,name:e.target.value}:x))} onBlur={e=>{renameLayer(layer.id,e.currentTarget.value);setRenaming("");}} onKeyDown={e=>{if(e.key==="Enter"){renameLayer(layer.id,layer.name);setRenaming("");}}}/>:<span className="layer-name" onDoubleClick={e=>{e.stopPropagation();setRenaming(layer.id);}}>{layer.name}</span>}
            <button title="Hide/show" onClick={e=>{e.stopPropagation();toggleLayer(layer.id,"hidden");}}>◉</button><button title="Lock/unlock" onClick={e=>{e.stopPropagation();toggleLayer(layer.id,"locked");}}>⌑</button>
            {selected===layer.id&&<div className="layer-more"><button title="Move up" onClick={e=>{e.stopPropagation();moveLayer(layer.id,-1);}}>↑</button><button title="Move down" onClick={e=>{e.stopPropagation();moveLayer(layer.id,1);}}>↓</button><button title="Duplicate" onClick={e=>{e.stopPropagation();duplicateLayer(layer.id);}}>⧉</button><button title="Group" onClick={e=>{e.stopPropagation();groupLayer(layer.id);}}>⊞</button></div>}
          </div>)}
        </div>
        <div className="left-footer"><div className="panel-section-title"><span>ANIMATION SEQUENCES</span><button onClick={()=>addSequence()}>＋</button></div>
          {project.sequences.map(s=><div className={"sequence-row "+(s.id===currentSequence?.id?"selected":"")} key={s.id} onClick={()=>{setActiveSequenceId(s.id);setActiveTrackId("");}}><span className="sequence-dot"/><span>{s.name}</span><button onClick={e=>{e.stopPropagation();commit(d=>{d.sequences=d.sequences.filter(x=>x.id!==s.id);});}}>×</button></div>)}
          <button className="add-sequence" onClick={()=>addSequence()}>＋ Create animation</button>
        </div>
      </aside>
      <section className="center-workspace">
        <div className="canvas-toolbar"><div><b>CANVAS</b><span className="canvas-url">/ {project.name.toLowerCase().replace(/\s+/g,"-")}</span></div><div><span className="canvas-badge">{breakpoint.toUpperCase()} · LIVE DOM</span><button onClick={()=>refreshPreview()}>↻ Refresh</button><button onClick={()=>{const frame=iframeRef.current;if(frame)frame.contentWindow?.scrollTo({top:0,behavior:"smooth"});}}>↑ Top</button></div></div>
        <div className="canvas-area">
          <div className="browser-frame" style={{width:breakpoint==="desktop"?"100%":breakpoint==="tablet"?"768px":"390px"}}>
            <div className="browser-chrome"><div className="browser-dots"><i/><i/><i/></div><div className="address">⌁ &nbsp; preview.figcraft.local / {project.name}</div><span>↗</span></div>
            <iframe ref={iframeRef} title="Website preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" srcDoc={project.html} onLoad={refreshLayers}/>
          </div>
          {!previewMode&&<div className="canvas-hint">SELECT AN ELEMENT · CLICK ANY LAYER IN THE PREVIEW</div>}
        </div>
        <section className="timeline-panel">
          <div className="timeline-head"><div><b>TIMELINE</b><span>{currentSequence?.name??"No animation selected"}</span></div><div className="timeline-controls">
            <button onClick={()=>{setPlayhead(0);controllerRef.current?.seek(currentSequence?.id??"",0);}}>↤</button>
            <button className="play-icon" onClick={()=>{if(!currentSequence)return;setPlayhead(0);controllerRef.current?.play(currentSequence.id);setPlaying(true);}}>{playing?"↻":"▶"}</button>
            <button onClick={()=>{controllerRef.current?.pause(currentSequence?.id??"");setPlaying(false);}}>Ⅱ</button>
            <span className="timecode">{playhead.toFixed(2)}s / {duration.toFixed(2)}s</span>
            <button onClick={()=>setZoom(z=>Math.min(2.5,z*1.2))}>＋</button><button onClick={()=>setZoom(z=>Math.max(.4,z/1.2))}>－</button>
          </div></div>
          <div className="timeline-scroll"><div className="timeline-ruler" style={{width:`${Math.max(600,duration*120*zoom)}px`}}>
            {Array.from({length:Math.ceil(duration*2)+1},(_,i)=><span key={i} style={{left:`${i*0.5/duration*100}%`}}>{i%2===0?`${(i/2).toFixed(1)}s`:"·"}</span>)}
          </div>
          <div className="timeline-track-list" style={{width:`${Math.max(100,duration*120*zoom)}%`}}>
            {currentSequence?.tracks.map(track=><div key={track.id} className={"timeline-track "+(track.id===currentTrack?.id?"active":"")} onClick={()=>setActiveTrackId(track.id)}>
              <div className="track-label"><span>{track.property}</span><small>{track.target===selectorFor(selected)?"Selected layer":track.target}</small></div>
              <div className="track-lane">{track.keyframes.map(key=><button key={key.id} className="keyframe-diamond" style={{left:`${(key.at+track.startTime)/duration*100}%`}} title={`${key.at}s: ${key.value}`} onClick={e=>{e.stopPropagation();setActiveTrackId(track.id);setPlayhead(key.at);}} onDoubleClick={e=>{e.stopPropagation();if(window.confirm("Delete this keyframe?"))commit(d=>{const t=d.sequences.find(x=>x.id===currentSequence?.id)?.tracks.find(x=>x.id===track.id);if(t)t.keyframes=t.keyframes.filter(k=>k.id!==key.id);});}}/>)}</div>
            </div>)}
            {currentSequence?.tracks.length===0&&<div className="empty-timeline">Add a property action to create your first animation track.</div>}
          </div>
          <div className="timeline-playhead" style={{left:`${playhead/duration*100}%`}}/>
          <input className="playhead-slider" type="range" min="0" max={duration} step=".01" value={playhead} onChange={e=>scrub(Number(e.target.value))}/></div>
          <div className="timeline-bottom"><span>{currentSequence?.tracks.length??0} ACTION TRACKS</span><span>DOUBLE-CLICK A DIAMOND TO REMOVE A KEYFRAME · DRAG TIMING IN THE INSPECTOR</span></div>
        </section>
      </section>
      <aside className="right-panel">
        <div className="inspector-header"><div><b>Animation Inspector</b><small>{selectedLayer?.name??"No element selected"}</small></div><button onClick={()=>setShowPresets(v=>!v)}>✦ Presets</button></div>
        <nav className="inspector-tabs">{(["Trigger","Animate","Timeline","Motion","Advanced"] as Tab[]).map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}</button>)}</nav>
        <div className="inspector-content">
          {tab==="Trigger"&&<TriggerInspector sequence={currentSequence} update={updateTrigger} addSequence={addSequence}/>}
          {tab==="Animate"&&<AnimateInspector addTrack={addTrack} track={currentTrack} updateTrack={updateTrack} removeTrack={removeTrack} addKeyframe={addKeyframe} selected={selected}/>}
          {tab==="Timeline"&&<TimelineInspector sequence={currentSequence} track={currentTrack} updateKeyframe={updateKeyframe} playhead={playhead}/>}
          {tab==="Motion"&&<MotionInspector sequence={currentSequence} update={updateMotion}/>}
          {tab==="Advanced"&&<AdvancedInspector sequence={currentSequence} updateTrigger={updateTrigger} breakpoint={breakpoint} track={currentTrack} commit={commit} readCss={readCss} writeCss={writeCss}/>}
        </div>
        <div className="inspector-footer"><span className={previewMode?"green-dot":"amber-dot"}/>{status}</div>
      </aside>
    </main>
    {showPresets&&<div className="modal-backdrop" onClick={()=>setShowPresets(false)}><div className="preset-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><b>Animation presets</b><small>Apply editable property tracks to the selected layer.</small></div><button onClick={()=>setShowPresets(false)}>×</button></div><div className="preset-grid">{PRESETS.map(p=><button key={p.group+p.name} onClick={()=>applyPreset(p)}><span>{p.group.toUpperCase()}</span><b>{p.name}</b><small>{PROPERTY_META[p.property].label}</small></button>)}</div></div></div>}
    {htmlInputOpen&&<div className="modal-backdrop"><div className="html-modal"><div className="modal-head"><div><b>Website source</b><small>Edit the HTML loaded in the preview.</small></div><button onClick={()=>setHtmlInputOpen(false)}>×</button></div><textarea value={htmlDraft} onChange={e=>setHtmlDraft(e.target.value)} spellCheck={false}/><div className="modal-actions"><button onClick={()=>setHtmlInputOpen(false)}>Cancel</button><button className="primary-action" onClick={()=>{commit(d=>{d.html=prepareHtml(htmlDraft);},"Website source updated");setHtmlInputOpen(false);}}>Apply HTML</button></div></div></div>}
    <footer className="statusbar"><span><i/> {previewMode?"PREVIEW ENGINE ACTIVE":"EDITOR READY"}</span><span>{warnings.length?warnings.length+" warnings": "NO RUNTIME WARNINGS"}</span><span>GSAP 3 · SCROLLTRIGGER · VISUAL BUILDER</span></footer>
  </div>;
}

function Field({label,value,onChange,unit="",type="text",step,options}:{label:string;value:string|number|boolean;onChange:(v:string|number|boolean)=>void;unit?:string;type?:"text"|"number"|"checkbox"|"select"|"color";step?:number;options?:string[]}){
 return <label className="field"><span>{label}</span><div className="field-control">{type==="checkbox"?<input type="checkbox" checked={Boolean(value)} onChange={e=>onChange(e.target.checked)}/>:type==="select"?<select value={String(value)} onChange={e=>onChange(e.target.value)}>{(options??[]).map(o=><option key={o} value={o}>{o}</option>)}</select>:<><input type={type} step={step??"any"} value={String(value)} onChange={e=>onChange(type==="number"?Number(e.target.value):e.target.value)}/>{unit&&<small>{unit}</small>}</>}</div></label>;
}
function Section({title,children,defaultOpen=true}:{title:string;children:React.ReactNode;defaultOpen?:boolean}){
 const [open,setOpen]=useState(defaultOpen);
 return <section className="inspector-section"><button className="section-heading" onClick={()=>setOpen(v=>!v)}><span>{title}</span><b>{open?"−":"＋"}</b></button>{open&&<div className="section-body">{children}</div>}</section>;
}
function TriggerInspector({sequence,update,addSequence}:{sequence?:AnimationSequence;update:(v:Partial<AnimationSequence["trigger"]>)=>void;addSequence:(t?:TriggerType)=>void}){
 if(!sequence)return <div className="empty-inspector"><b>No sequence</b><p>Create an animation to configure its trigger.</p><button className="primary-action" onClick={()=>addSequence()}>＋ New animation</button></div>;
 return <><Section title="Trigger type"><select className="wide-select" value={sequence.trigger.type} onChange={e=>update({type:e.target.value as TriggerType})}>{TRIGGER_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>)}</select><small className="helper">{TRIGGER_GROUPS.flatMap(g=>g.options).find(o=>o.id===sequence.trigger.type)?.description}</small></Section>
 <Section title="Trigger target"><Field label="CSS selector" value={sequence.trigger.target||"[data-avab-id]"} onChange={v=>update({target:String(v)})}/><Field label="Scroller selector" value={sequence.trigger.scroller} onChange={v=>update({scroller:String(v)})}/><Field label="Custom event name" value={sequence.trigger.eventName} onChange={v=>update({eventName:String(v)})}/><Field label="Class to observe" value={sequence.trigger.className} onChange={v=>update({className:String(v)})}/></Section>
 <Section title="Scroll boundaries"><Field label="Start" value={sequence.trigger.start} onChange={v=>update({start:String(v)})}/><Field label="End" value={sequence.trigger.end} onChange={v=>update({end:String(v)})}/><div className="boundary-visual"><div className="viewport-mini"><i className="viewport-line start"/><i className="viewport-line end"/><span>VIEWPORT</span></div><div><b>{sequence.trigger.start}</b><small>START POSITION</small><b>{sequence.trigger.end}</b><small>END POSITION</small></div></div><Field label="Scrub progress" value={sequence.trigger.scrub} type="checkbox" onChange={v=>update({scrub:Boolean(v)})}/><Field label="Scrub smoothing" value={sequence.trigger.smoothing} unit="s" type="number" step={.1} onChange={v=>update({smoothing:Number(v)})}/><Field label="Horizontal scroll" value={sequence.trigger.horizontal} type="checkbox" onChange={v=>update({horizontal:Boolean(v)})}/></Section>
 <Section title="Scroll actions"><Field label="Pin element" value={sequence.trigger.pin} type="checkbox" onChange={v=>update({pin:Boolean(v)})}/><Field label="Pin target" value={sequence.trigger.pinTarget} onChange={v=>update({pinTarget:String(v)})}/><Field label="Pin spacing" value={sequence.trigger.pinSpacing} type="checkbox" onChange={v=>update({pinSpacing:Boolean(v)})}/><Field label="Toggle actions" value={sequence.trigger.toggleActions} onChange={v=>update({toggleActions:String(v)})}/><Field label="Once only" value={sequence.trigger.once} type="checkbox" onChange={v=>update({once:Boolean(v)})}/><Field label="Reverse on scroll up" value={sequence.trigger.reverse} type="checkbox" onChange={v=>update({reverse:Boolean(v)})}/><Field label="Snap points" value={sequence.trigger.snap} type="number" onChange={v=>update({snap:Number(v)})}/><Field label="Debug markers" value={sequence.trigger.markers} type="checkbox" onChange={v=>update({markers:Boolean(v)})}/></Section>
 <Section title="Event settings"><Field label="Delay" value={sequence.trigger.delay} unit="ms" type="number" onChange={v=>update({delay:Number(v)})}/><Field label="Visibility threshold" value={sequence.trigger.threshold} unit="px" type="number" onChange={v=>update({threshold:Number(v)})}/><Field label="Depends on sequence ID" value={sequence.trigger.dependsOn} onChange={v=>update({dependsOn:String(v)})}/></Section></>;
}
function AnimateInspector({addTrack,track,updateTrack,removeTrack,addKeyframe,selected}:{addTrack:(p:AnimProperty)=>void;track?:PropertyTrack;updateTrack:(v:Partial<PropertyTrack>)=>void;removeTrack:()=>void;addKeyframe:()=>void;selected:string}){
 return <><Section title="Add property action">{PROPERTY_GROUPS.map(g=><div className="property-group" key={g.label}><b>{g.label}</b><div className="property-buttons">{g.properties.map(p=><button key={p} onClick={()=>addTrack(p)}>{PROPERTY_META[p].label}</button>)}</div></div>)}</Section>
 {track?<Section title={`Selected action · ${track.label}`}><Field label="Action name" value={track.label} onChange={v=>updateTrack({label:String(v)})}/><Field label="Target selector" value={track.target} onChange={v=>updateTrack({target:String(v)})}/><Field label="Track start time" value={track.startTime} unit="s" type="number" step={.05} onChange={v=>updateTrack({startTime:Math.max(0,Number(v))})}/><Field label="Property" value={track.property} type="select" options={PROPERTY_GROUPS.flatMap(g=>g.properties)} onChange={v=>updateTrack({property:v as AnimProperty})}/><Field label="Enabled" value={track.enabled} type="checkbox" onChange={v=>updateTrack({enabled:Boolean(v)})}/><div className="keyframe-editor">{track.keyframes.map((k,i)=><div className="keyframe-row" key={k.id}><b>K{i+1}</b><Field label="Time" value={k.at} unit="s" type="number" step={.01} onChange={v=>updateTrack({keyframes:track.keyframes.map(x=>x.id===k.id?{...x,at:Number(v)}:x)})}/><Field label="Value" value={k.value} onChange={v=>updateTrack({keyframes:track.keyframes.map(x=>x.id===k.id?{...x,value:v}:x)})}/><button onClick={()=>updateTrack({keyframes:track.keyframes.filter(x=>x.id!==k.id)})}>×</button></div>)}</div><button className="wide-outline" onClick={addKeyframe}>＋ Add keyframe at playhead</button><button className="wide-danger" onClick={removeTrack}>Remove action</button></Section>:<div className="empty-inspector"><p>Add a property action, then select its track to edit keyframes and targets.</p></div>}</>;
}
function TimelineInspector({sequence,track,updateKeyframe,playhead}:{sequence?:AnimationSequence;track?:PropertyTrack;updateKeyframe:(trackId:string,keyId:string,patch:Partial<Keyframe>)=>void;playhead:number}){
 if(!sequence||!track)return <div className="empty-inspector"><p>Select an animation track to edit its keyframes.</p></div>;
 return <><Section title="Keyframe editor"><p className="helper">Selected track: {track.label}</p>{track.keyframes.map((k,i)=><div className="keyframe-card" key={k.id}><div className="keyframe-card-head"><b>KEYFRAME {i+1}</b><small>{k.id}</small></div><Field label="Timeline position" value={k.at} unit="s" type="number" step={.01} onChange={v=>updateKeyframe(track.id,k.id,{at:Number(v)})}/><Field label="Value" value={k.value} onChange={v=>updateKeyframe(track.id,k.id,{value:v})}/><Field label="Easing" value={k.ease} type="select" options={EASINGS} onChange={v=>updateKeyframe(track.id,k.id,{ease:String(v)})}/></div>)}<div className="helper">Current playhead: {playhead.toFixed(2)}s. Keyframe timing is saved to the project.</div></Section></>;
}
function MotionInspector({sequence,update}:{sequence?:AnimationSequence;update:(v:Partial<AnimationSequence["motion"]>)=>void}){
 if(!sequence)return null;const m=sequence.motion;
 return <><Section title="Timing"><Field label="Duration" value={m.duration} unit="s" type="number" step={.05} onChange={v=>update({duration:Number(v)})}/><Field label="Delay" value={m.delay} unit="s" type="number" step={.05} onChange={v=>update({delay:Number(v)})}/><Field label="Playback speed" value={m.speed} unit="×" type="number" step={.1} onChange={v=>update({speed:Number(v)})}/><Field label="Direction" value={m.direction} type="select" options={["normal","reverse","alternate","alternate-reverse"]} onChange={v=>update({direction:v as AnimationSequence["motion"]["direction"]})}/></Section><Section title="Repeat"><Field label="Repeat count (-1 = infinite)" value={m.repeat} type="number" onChange={v=>update({repeat:Number(v)})}/><Field label="Repeat delay" value={m.repeatDelay} unit="s" type="number" onChange={v=>update({repeatDelay:Number(v)})}/><Field label="Yoyo" value={m.yoyo} type="checkbox" onChange={v=>update({yoyo:Boolean(v)})}/></Section><Section title="Stagger"><Field label="Enable stagger" value={m.stagger} type="checkbox" onChange={v=>update({stagger:Boolean(v)})}/><Field label="Amount" value={m.staggerAmount} unit="s" type="number" step={.01} onChange={v=>update({staggerAmount:Number(v)})}/><Field label="Stagger from" value={m.staggerFrom} type="select" options={["start","center","edges","random","end"]} onChange={v=>update({staggerFrom:v as AnimationSequence["motion"]["staggerFrom"]})}/><Field label="Overlap" value={m.overlap} unit="s" type="number" step={.05} onChange={v=>update({overlap:Number(v)})}/></Section><Section title="Accessibility"><Field label="Respect reduced motion" value={m.respectReducedMotion} type="checkbox" onChange={v=>update({respectReducedMotion:Boolean(v)})}/></Section></>;
}
function AdvancedInspector({sequence,updateTrigger,breakpoint,track,commit,readCss,writeCss}:{sequence?:AnimationSequence;updateTrigger:(v:Partial<AnimationSequence["trigger"]>)=>void;breakpoint:Breakpoint;track?:PropertyTrack;commit:(f:(d:StudioProject)=>void,label?:string)=>void;readCss:(p:string)=>string;writeCss:(p:string,v:string)=>void}){
 if(!sequence)return null;
 const apply=(enabled:boolean)=>{if(!track)return;commit(d=>{const s=d.sequences.find(x=>x.id===sequence.id);const t=s?.tracks.find(x=>x.id===track.id);if(!t)return;t.overrides={...t.overrides,[breakpoint]:{enabled,keyframes:clone(t.overrides?.[breakpoint]?.keyframes??t.keyframes)}};},`${breakpoint} override changed`);};
 const current=track?.overrides?.[breakpoint];
 return <><Section title="Responsive breakpoint"><div className="breakpoint-pill">{breakpoint.toUpperCase()}</div><p className="helper">Overrides are stored per desktop, tablet and mobile. Disable this track or change its keyframe values for the active breakpoint.</p>{track&&<><Field label={`Enable on ${breakpoint}`} value={current?.enabled??true} type="checkbox" onChange={v=>apply(Boolean(v))}/>{(current?.keyframes??track.keyframes).map(k=><div className="keyframe-row" key={k.id}><b>{k.at}s</b><Field label="Value" value={k.value} onChange={v=>commit(d=>{const t=d.sequences.find(s=>s.id===sequence.id)?.tracks.find(x=>x.id===track.id);if(!t)return;const bp=t.overrides?.[breakpoint];if(bp)bp.keyframes=bp.keyframes.map(x=>x.id===k.id?{...x,value:v}:x);else t.overrides={...t.overrides,[breakpoint]:{enabled:true,keyframes:t.keyframes.map(x=>x.id===k.id?{...x,value:v}:x)}};})}/></div>)}</>}</Section><Section title="Advanced trigger"><Field label="Scroller selector" value={sequence.trigger.scroller} onChange={v=>updateTrigger({scroller:String(v)})}/><Field label="Horizontal" value={sequence.trigger.horizontal} type="checkbox" onChange={v=>updateTrigger({horizontal:Boolean(v)})}/><Field label="Start marker" value={sequence.trigger.markers} type="checkbox" onChange={v=>updateTrigger({markers:Boolean(v)})}/><Field label="Page scrolled threshold" value={sequence.trigger.threshold} type="number" onChange={v=>updateTrigger({threshold:Number(v)})}/></Section><Section title="CSS position & layout"><p className="helper">Position is applied to the selected real DOM element. Sticky positioning needs a scrollable ancestor and an offset.</p><Field label="Position mode" value={readCss("position")} type="select" options={["static","relative","absolute","fixed","sticky"]} onChange={v=>writeCss("position",String(v))}/>{(["top","right","bottom","left"] as const).map(side=><Field key={side} label={side[0].toUpperCase()+side.slice(1)} value={readCss(side)} onChange={v=>writeCss(side,String(v))}/>)}<Field label="Z-index" value={readCss("z-index")} onChange={v=>writeCss("z-index",String(v))}/><Field label="Overflow" value={readCss("overflow")} type="select" options={["visible","hidden","clip","auto","scroll"]} onChange={v=>writeCss("overflow",String(v))}/><Field label="Pointer events" value={readCss("pointer-events")} type="select" options={["auto","none","visible","painted"]} onChange={v=>writeCss("pointer-events",String(v))}/></Section></>;
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
