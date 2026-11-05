import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import type { AnimationSequence, AnimProperty, Breakpoint, Keyframe, LayerItem, PropertyTrack, StudioProject, TriggerType } from "./model";
import { createSequence, createTrack, EASINGS, makeId, makeSampleHtml, prepareHtml, PROPERTY_GROUPS, PROPERTY_META, TRIGGER_GROUPS } from "./model";
import { mountAnimations, type AnimationController } from "./runtime";
import { importWebsiteZip } from "./importZip";

type Tab = "Design" | "Trigger" | "Animate" | "Timeline" | "Motion" | "Advanced";
const STORAGE_KEY = "figcraft-motion-studio-v1";
const DEMO: StudioProject = { version: 1, name: "Motion Studio Demo", html: prepareHtml(makeSampleHtml()), sequences: [] };

const PRESETS: { group: string; name: string; property: AnimProperty; from: number | string; to: number | string; ease: string; trigger?: TriggerType; motion?: Partial<AnimationSequence["motion"]>; pin?: boolean }[] = [
  {group:"Entrance",name:"Fade In",property:"opacity",from:0,to:100,ease:"power2.out",trigger:"pageReady"},
  {group:"Entrance",name:"Fade Up",property:"y",from:64,to:0,ease:"power3.out",trigger:"pageReady"},
  {group:"Entrance",name:"Fade Down",property:"y",from:-64,to:0,ease:"power3.out",trigger:"pageReady"},
  {group:"Entrance",name:"Fade Left",property:"x",from:80,to:0,ease:"power3.out",trigger:"pageReady"},
  {group:"Entrance",name:"Fade Right",property:"x",from:-80,to:0,ease:"power3.out",trigger:"pageReady"},
  {group:"Entrance",name:"Zoom In",property:"scaleX",from:0.72,to:1,ease:"power3.out",trigger:"pageReady"},
  {group:"Entrance",name:"Zoom Out",property:"scaleX",from:1.2,to:1,ease:"power3.out",trigger:"pageReady"},
  {group:"Entrance",name:"Rotate In",property:"rotation",from:-16,to:0,ease:"back.out(1.7)",trigger:"pageReady"},
  {group:"Entrance",name:"Blur In",property:"blur",from:18,to:0,ease:"power2.out",trigger:"pageReady"},
  {group:"Text",name:"Word Reveal",property:"textReveal",from:"words",to:"words",ease:"power3.out",trigger:"scrollIntoView"},
  {group:"Text",name:"Character Reveal",property:"textReveal",from:"characters",to:"characters",ease:"power3.out",trigger:"scrollIntoView"},
  {group:"Text",name:"Line Reveal",property:"textReveal",from:"lines",to:"lines",ease:"power3.out",trigger:"scrollIntoView"},
  {group:"Text",name:"Typewriter",property:"textReveal",from:"characters",to:"characters",ease:"none",trigger:"pageReady"},
  {group:"Text",name:"Staggered Text",property:"textReveal",from:"words",to:"words",ease:"back.out(1.7)",trigger:"scrollIntoView"},
  {group:"Text",name:"Mask Reveal",property:"clipPath",from:"inset(0 0 100% 0)",to:"inset(0 0 0% 0)",ease:"power3.inOut",trigger:"scrollIntoView"},
  {group:"Image",name:"Image Reveal",property:"clipPath",from:"inset(0 0 100% 0)",to:"inset(0 0 0% 0)",ease:"power3.inOut",trigger:"scrollIntoView"},
  {group:"Image",name:"Zoom Reveal",property:"scaleX",from:1.16,to:1,ease:"power2.out",trigger:"scrollIntoView"},
  {group:"Image",name:"Parallax",property:"y",from:80,to:-80,ease:"none",trigger:"whileScrollingInView"},
  {group:"Image",name:"Masked Image Reveal",property:"clipPath",from:"inset(0 100% 0 0)",to:"inset(0 0% 0 0)",ease:"power3.inOut",trigger:"scrollIntoView"},
  {group:"Interaction",name:"Hover Scale",property:"scaleX",from:1,to:1.06,ease:"power2.out",trigger:"elementHover"},
  {group:"Interaction",name:"Hover Lift",property:"y",from:0,to:-8,ease:"power2.out",trigger:"elementHover"},
  {group:"Interaction",name:"Cursor Follow · X",property:"x",from:-30,to:30,ease:"none",trigger:"mouseMove"},
  {group:"Interaction",name:"Floating",property:"y",from:-12,to:12,ease:"sine.inOut",trigger:"pageReady",motion:{repeat:-1,yoyo:true,duration:2}},
  {group:"Interaction",name:"Infinite Rotation",property:"rotation",from:0,to:360,ease:"none",trigger:"pageReady",motion:{repeat:-1,duration:4}},
  {group:"Scroll",name:"Scroll Fade",property:"opacity",from:0,to:100,ease:"none",trigger:"whileScrollingInView"},
  {group:"Scroll",name:"Scroll Parallax",property:"y",from:80,to:-80,ease:"none",trigger:"whileScrollingInView"},
  {group:"Scroll",name:"Scroll Zoom",property:"scaleX",from:0.8,to:1,ease:"none",trigger:"whileScrollingInView"},
  {group:"Scroll",name:"Sticky Reveal",property:"y",from:50,to:0,ease:"power2.out",trigger:"scrollIntoView",pin:true},
  {group:"Scroll",name:"Pinned Section Animation",property:"y",from:120,to:-120,ease:"none",trigger:"scrollProgress",pin:true},
  {group:"Scroll",name:"Horizontal Scroll Movement",property:"x",from:260,to:-260,ease:"none",trigger:"scrollProgress",pin:true}
];

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function selectorFor(id: string) { return `[data-avab-id="${CSS.escape(id)}"]`; }
function selectorForMany(ids: string[]) { return ids.length>1?`:is(${ids.map(selectorFor).join(",")})`:ids[0]?selectorFor(ids[0]):""; }
function serializeFrame(frame: HTMLIFrameElement): string {
  const source=frame.contentDocument;
  if(!source)return "";
  const root=source.documentElement.cloneNode(true) as HTMLElement;
  root.querySelector("#avab-editor-style")?.remove();
  root.querySelector("#avab-selection-overlay")?.remove();
  root.querySelectorAll("[data-avab-selected]").forEach(el=>el.removeAttribute("data-avab-selected"));
  return "<!doctype html>\\n"+root.outerHTML;
}
function fileName(name: string) { return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "motion-project"; }

export default function App() {
  const [project, setProject] = useState<StudioProject>(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as StudioProject : DEMO; } catch { return DEMO; }
  });
  const [selected, setSelected] = useState("layer-1");
  const [selectedIds, setSelectedIds] = useState<string[]>(["layer-1"]);
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<LayerItem | null>(null);
  const [activeSequenceId, setActiveSequenceId] = useState("");
  const [activeTrackId, setActiveTrackId] = useState("");
  const [tab, setTab] = useState<Tab>("Design");
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  const [previewMode, setPreviewMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [htmlInputOpen, setHtmlInputOpen] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [customPresets, setCustomPresets] = useState<PropertyTrack[]>(()=>{try{return JSON.parse(localStorage.getItem("figcraft-motion-presets-v1")||"[]") as PropertyTrack[];}catch{return [];}});
  const [draggingKeyframe,setDraggingKeyframe]=useState<{trackId:string;keyId:string;at:number}|null>(null);
  const [trackClipboard,setTrackClipboard]=useState<PropertyTrack|null>(null);
  const [renaming, setRenaming] = useState("");
  const [dragLayer, setDragLayer] = useState("");
  const [status, setStatus] = useState("Ready");
  const [undoStack, setUndoStack] = useState<StudioProject[]>([]);
  const [redoStack, setRedoStack] = useState<StudioProject[]>([]);
  const [dirty, setDirty] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const designImageRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef(project);
  const selectedRef = useRef(selected);
  const previewModeRef = useRef(previewMode);
  const controllerRef = useRef<AnimationController | null>(null);
  const currentSequence = project.sequences.find(s => s.id === activeSequenceId) ?? project.sequences[0];
  const currentTrack = currentSequence?.tracks.find(t => t.id === activeTrackId) ?? currentSequence?.tracks[0];
  const duration = useMemo(() => Math.max(1, ...project.sequences.flatMap(s => s.tracks.flatMap(t => t.keyframes.map(k => k.at + t.startTime)))), [project.sequences]);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(()=>{localStorage.setItem("figcraft-motion-presets-v1",JSON.stringify(customPresets));},[customPresets]);
  useEffect(() => { selectedRef.current = selected; previewModeRef.current = previewMode; }, [selected, previewMode]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        setDirty(false);
      } catch {
        setStatus("Browser storage is full · Export the project JSON to keep a backup");
      }
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
        next.push({id,name:text,tag:el.tagName.toLowerCase(),depth,parent:parent.getAttribute("data-avab-id") || "body",className:typeof el.className==="string"?el.className:"",isGroup:el.getAttribute("data-avab-group")==="true"});
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
      let dragState:{element:HTMLElement;pointerId:number;startX:number;startY:number;baseX:number;baseY:number}|null=null;
      let resizeState:{element:HTMLElement;pointerId:number;handle:string;startX:number;startY:number;width:number;height:number;left:number;top:number;baseX:number;baseY:number}|null=null;
      const updateSelectionOverlay=()=>{
        const overlay=d.getElementById("avab-selection-overlay") as HTMLElement|null;
        const id=selectedRef.current;
        const element=id?d.querySelector(selectorFor(id)) as HTMLElement|null:null;
        if(!overlay)return;
        if(!element||previewModeRef.current){overlay.style.display="none";return;}
        const rect=element.getBoundingClientRect();
        overlay.style.display="block";overlay.style.left=rect.left+"px";overlay.style.top=rect.top+"px";
        overlay.style.width=rect.width+"px";overlay.style.height=rect.height+"px";
      };
      const iframeWindow=frame.contentWindow as (Window & {__avabUpdateOverlay?:()=>void})|null;
      iframeWindow?.setTimeout(()=>{
        const overlay=d.createElement("div");overlay.id="avab-selection-overlay";
        overlay.style.cssText="position:fixed;display:none;box-sizing:border-box;border:1px solid #d7f75b;outline:1px solid #10130b;z-index:2147483647;pointer-events:none;";
        overlay.innerHTML=["nw","n","ne","e","se","s","sw","w"].map(handle=>'<i data-avab-resize="'+handle+'"></i>').join("");
        const handleStyles:Record<string,string>={nw:"left:0;top:0;transform:translate(-50%,-50%);cursor:nwse-resize;",n:"left:50%;top:0;transform:translate(-50%,-50%);cursor:ns-resize;",ne:"left:100%;top:0;transform:translate(-50%,-50%);cursor:nesw-resize;",e:"left:100%;top:50%;transform:translate(-50%,-50%);cursor:ew-resize;",se:"left:100%;top:100%;transform:translate(-50%,-50%);cursor:nwse-resize;",s:"left:50%;top:100%;transform:translate(-50%,-50%);cursor:ns-resize;",sw:"left:0;top:100%;transform:translate(-50%,-50%);cursor:nesw-resize;",w:"left:0;top:50%;transform:translate(-50%,-50%);cursor:ew-resize;"};
        overlay.querySelectorAll<HTMLElement>("[data-avab-resize]").forEach(handle=>{
          const name=handle.dataset.avabResize||"se";
          handle.style.cssText="position:absolute;width:9px;height:9px;box-sizing:border-box;background:#d7f75b;border:1px solid #14170d;border-radius:2px;pointer-events:auto;"+(handleStyles[name]||handleStyles.se);
        });
        d.body.appendChild(overlay);
        if(iframeWindow)iframeWindow.__avabUpdateOverlay=updateSelectionOverlay;
        updateSelectionOverlay();
        d.addEventListener("scroll",updateSelectionOverlay,true);
        iframeWindow?.addEventListener("resize",updateSelectionOverlay);
      },0);
      d.addEventListener("pointerdown",e=>{
        if(previewModeRef.current) return;
        const pointer=e as PointerEvent;
        const handle=pointer.target instanceof Element?pointer.target.closest("[data-avab-resize]"):null;
        if(handle){
          const id=selectedRef.current;
          const element=id?d.querySelector(selectorFor(id)) as HTMLElement|null:null;
          if(element&&pointer.button===0){
            const rect=element.getBoundingClientRect(),computed=d.defaultView?.getComputedStyle(element);
            const parts=(computed?.translate||"none").split(/\\s+/);
            resizeState={element,pointerId:pointer.pointerId,handle:handle.getAttribute("data-avab-resize")||"se",startX:pointer.clientX,startY:pointer.clientY,width:rect.width,height:rect.height,left:rect.left,top:rect.top,baseX:parts[0]==="none"?0:parseFloat(parts[0])||0,baseY:parts[1]?parseFloat(parts[1])||0:0};
            try{(handle as HTMLElement).setPointerCapture(pointer.pointerId);}catch{}
            pointer.preventDefault();pointer.stopPropagation();
          }
          return;
        }
        const target=pointer.target instanceof Element?pointer.target.closest("[data-avab-id]"):null;
        if(!target||target.closest("[data-avab-locked='true']")) return;
        const id=target.getAttribute("data-avab-id");
        if(id) window.postMessage({type:"AVAB_SELECT",id,extend:pointer.shiftKey||pointer.metaKey||pointer.ctrlKey},"*");
        if(pointer.button!==0||!(target instanceof HTMLElement))return;
        const computed=d.defaultView?.getComputedStyle(target);
        const parts=(computed?.translate||"none").split(/\\s+/);
        dragState={element:target,pointerId:pointer.pointerId,startX:pointer.clientX,startY:pointer.clientY,baseX:parts[0]==="none"?0:parseFloat(parts[0])||0,baseY:parts[1]?parseFloat(parts[1])||0:0};
        try{target.setPointerCapture(pointer.pointerId);}catch{}
        pointer.preventDefault();
      },true);
      d.addEventListener("pointermove",e=>{
        const pointer=e as PointerEvent;
        if(resizeState&&pointer.pointerId===resizeState.pointerId){
          const state=resizeState,dx=pointer.clientX-state.startX,dy=pointer.clientY-state.startY;
          const west=state.handle.includes("w"),north=state.handle.includes("n");
          state.element.style.width=Math.max(12,state.width+(west?-dx:state.handle.includes("e")?dx:0))+"px";
          state.element.style.height=Math.max(12,state.height+(north?-dy:state.handle.includes("s")?dy:0))+"px";
          if(west||north)state.element.style.translate=(state.baseX+(west?dx:0))+"px "+(state.baseY+(north?dy:0))+"px";
          updateSelectionOverlay();pointer.preventDefault();return;
        }
        const state=dragState;
        if(!state||pointer.pointerId!==state.pointerId)return;
        pointer.preventDefault();
        const dx=pointer.clientX-state.startX,dy=pointer.clientY-state.startY;
        state.element.style.translate=(state.baseX+dx)+"px "+(state.baseY+dy)+"px";
        updateSelectionOverlay();
      },true);
      d.addEventListener("pointerup",e=>{
        const pointer=e as PointerEvent;
        if(resizeState&&pointer.pointerId===resizeState.pointerId){
          const moved=Math.abs(pointer.clientX-resizeState.startX)+Math.abs(pointer.clientY-resizeState.startY)>2;
          resizeState=null;if(moved)window.postMessage({type:"AVAB_DRAG_COMMIT"},"*");return;
        }
        if(!dragState||pointer.pointerId!==dragState.pointerId)return;
        const moved=Math.abs(pointer.clientX-dragState.startX)+Math.abs(pointer.clientY-dragState.startY)>2;
        dragState=null;
        if(moved)window.postMessage({type:"AVAB_DRAG_COMMIT"},"*");
      },true);
      d.addEventListener("pointercancel",()=>{dragState=null;},true);
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

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;
      const editing=target&&(target.tagName==="INPUT"||target.tagName==="TEXTAREA"||target.isContentEditable);
      if(editing)return;
      const modifier=event.ctrlKey||event.metaKey;
      if(modifier&&event.key.toLowerCase()==="d"){event.preventDefault();duplicateSelection();}
      if(modifier&&event.key.toLowerCase()==="g"){event.preventDefault();if(selectedIds.length===1)groupLayer(selectedIds[0]);}
      if(event.key==="Delete"||event.key==="Backspace"){if(selectedIds.length){event.preventDefault();deleteSelection();}}
      if(event.key==="Escape"){setSelectedIds([]);setSelected("");}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  });
  useEffect(()=>{ refreshPreview(); },[project.html,refreshPreview]);

  useEffect(()=>{
    const onMessage=(event:MessageEvent)=>{
      if(event.source!==iframeRef.current?.contentWindow)return;
      if(event.data?.type==="AVAB_DRAG_COMMIT"){
        const frame=iframeRef.current;
        if(frame){const html=serializeFrame(frame);commit(d=>{d.html=html;},"Element repositioned on canvas");}
      }
      if(event.data?.type==="AVAB_SELECT" && typeof event.data.id==="string") {
        const id=event.data.id as string;
        setSelected(id);
        setSelectedIds(current=>{
          if(event.data.extend===true) return current.includes(id)?current.filter(x=>x!==id):[...current,id];
          return [id];
        });
        setSelectedLayer(layers.find(l=>l.id===id)??null);
      }
    };
    window.addEventListener("message",onMessage);
    return()=>window.removeEventListener("message",onMessage);
  },[layers]);

  useEffect(()=>{
    const doc=iframeRef.current?.contentDocument;
    if(!doc) return;
    doc.querySelectorAll("[data-avab-selected]").forEach(el=>el.removeAttribute("data-avab-selected"));
    selectedIds.forEach(id=>doc.querySelector(selectorFor(id))?.setAttribute("data-avab-selected","true"));
    const style=doc.getElementById("avab-editor-style");
    if(style) style.textContent=`[data-avab-id]{cursor:${previewMode?"auto":"crosshair"}!important;outline:1px dashed transparent;outline-offset:2px}[data-avab-id]:hover{outline-color:${previewMode?"transparent":"rgba(151,203,255,.65)"}!important}[data-avab-selected="true"]{outline:2px solid #d7f75b!important}`;
    if(previewMode) doc.body.classList.add("avab-preview"); else doc.body.classList.remove("avab-preview");
    (iframeRef.current?.contentWindow as (Window & {__avabUpdateOverlay?:()=>void})|null)?.__avabUpdateOverlay?.();
  },[selected,selectedIds,previewMode,project.html]);

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
  const duplicateSequence=()=>{
    if(!currentSequence)return;
    const copy=clone(currentSequence);
    copy.id=makeId("seq");copy.name=`${copy.name} copy`;
    copy.tracks=copy.tracks.map(track=>({...track,id:makeId("track"),keyframes:track.keyframes.map(k=>({...k,id:makeId("kf")}))}));
    commit(d=>d.sequences.push(copy),"Animation duplicated");
    setActiveSequenceId(copy.id);setActiveTrackId("");
  };
  const addSequence=(type:TriggerType="scrollIntoView")=>{
    const s=createSequence(`Animation ${project.sequences.length+1}`,type);
    s.trigger.target=selectorForMany(selectedIds);
    commit(d=>d.sequences.push(s),"New animation created");
    setActiveSequenceId(s.id);setActiveTrackId("");setTab("Trigger");
  };
  const addTrack=(property:AnimProperty)=>{
    if(!currentSequence)return;
    const selector=selectorForMany(selectedIds);
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
    const at=Math.max(0,playhead-currentTrack.startTime);
    const last=currentTrack.keyframes[currentTrack.keyframes.length-1];
    const key:Keyframe={id:makeId("kf"),at,value:last?.value??0,ease:"power2.out"};
    commit(d=>d.sequences.find(s=>s.id===currentSequence.id)?.tracks.find(t=>t.id===currentTrack.id)?.keyframes.push(key),"Keyframe added");
  };
  const startKeyframeDrag=(event:React.PointerEvent<HTMLButtonElement>,track:PropertyTrack,key:Keyframe)=>{
    event.preventDefault();event.stopPropagation();
    const lane=event.currentTarget.parentElement;
    if(!lane)return;
    const rect=lane.getBoundingClientRect();
    const calculate=(clientX:number)=>Math.max(0,Math.min(duration-track.startTime,((clientX-rect.left)/Math.max(1,rect.width))*duration-track.startTime));
    const move=(ev:PointerEvent)=>setDraggingKeyframe({trackId:track.id,keyId:key.id,at:calculate(ev.clientX)});
    const up=(ev:PointerEvent)=>{
      const at=calculate(ev.clientX);
      document.removeEventListener("pointermove",move);
      document.removeEventListener("pointerup",up);
      updateKeyframe(track.id,key.id,{at});
      setDraggingKeyframe(null);
    };
    document.addEventListener("pointermove",move);
    document.addEventListener("pointerup",up,{once:true});
  };
  const saveCurrentPreset=()=>{
    if(!currentTrack)return;
    const name=window.prompt("Name this reusable animation preset",currentTrack.label);
    if(!name?.trim())return;
    const preset=clone(currentTrack);preset.id=makeId("preset");preset.label=name.trim();
    setCustomPresets(items=>[...items,preset]);setStatus("Custom preset saved");
  };
  const applyCustomPreset=(preset:PropertyTrack)=>{
    if(!currentSequence)return;
    const copy=clone(preset);copy.id=makeId("track");copy.target=selectorForMany(selectedIds);
    copy.keyframes=copy.keyframes.map(k=>({...k,id:makeId("kf")}));
    commit(d=>d.sequences.find(x=>x.id===currentSequence.id)?.tracks.push(copy),"Custom preset applied");
    setActiveTrackId(copy.id);setShowPresets(false);setTab("Animate");
  };
  const copyTrack=()=>{
    if(!currentTrack)return;
    setTrackClipboard(clone(currentTrack));setStatus("Animation action copied");
  };
  const pasteTrack=()=>{
    if(!currentSequence||!trackClipboard)return;
    const copy=clone(trackClipboard);copy.id=makeId("track");copy.target=selectorForMany(selectedIds);
    copy.keyframes=copy.keyframes.map(k=>({...k,id:makeId("kf")}));
    commit(d=>d.sequences.find(x=>x.id===currentSequence.id)?.tracks.push(copy),"Animation action pasted");
    setActiveTrackId(copy.id);setTab("Animate");
  };
  const duplicateTrack=()=>{
    if(!currentTrack||!currentSequence)return;
    const copy=clone(currentTrack);copy.id=makeId("track");copy.label=copy.label+" copy";
    copy.keyframes=copy.keyframes.map(k=>({...k,id:makeId("kf")}));
    commit(d=>d.sequences.find(x=>x.id===currentSequence.id)?.tracks.push(copy),"Animation action duplicated");
    setActiveTrackId(copy.id);
  };
  const removeTrack=()=>{
    if(!currentSequence||!currentTrack)return;
    commit(d=>{const s=d.sequences.find(x=>x.id===currentSequence.id);if(s)s.tracks=s.tracks.filter(t=>t.id!==currentTrack.id);});
    setActiveTrackId("");
  };
  const applyPreset=(preset:typeof PRESETS[number])=>{
    const sequence=currentSequence??createSequence(`Animation ${project.sequences.length+1}`,preset.trigger??"scrollIntoView");
    const track=createTrack(preset.property,selectorForMany(selectedIds),sequence.motion.duration);
    track.label=preset.name;
    track.keyframes[0].value=preset.from;track.keyframes[1].value=preset.to;
    track.keyframes.forEach(k=>k.ease=preset.ease);
    commit(d=>{
      let target=d.sequences.find(s=>s.id===sequence.id);
      if(!target){target=sequence;d.sequences.push(target);}
      target.tracks.push(track);
      if(preset.trigger)target.trigger={...target.trigger,type:preset.trigger,target:selectorForMany(selectedIds)};
      if(preset.pin){target.trigger.pin=true;target.trigger.pinTarget=selectorForMany(selectedIds);}
      if(preset.motion)target.motion={...target.motion,...preset.motion};
    },`Preset applied: ${preset.name}`);
    setActiveSequenceId(sequence.id);setActiveTrackId(track.id);setShowPresets(false);setTab("Animate");
  };

  const importHtml=async(file:File)=>{
    try{
      const html=file.name.toLowerCase().endsWith(".zip")
        ? await importWebsiteZip(file)
        : prepareHtml(await file.text());
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
    const site=project.html.replace("</body>",`<script src="./motion-runtime.js" defer></script></body>`);
    zip.file("index.html",site);
    zip.file("motion-project.json",JSON.stringify(project,null,2));
    zip.file("motion-runtime.js",exportRuntimeSource());
    zip.file("README.md",`# ${project.name}\n\nThis export uses GSAP and ScrollTrigger from jsDelivr. Keep an internet connection or vendor those libraries locally for offline hosting.\n\n1. Upload the contents of this folder to your web host.\n2. Open index.html.\n3. Animation settings are in motion-project.json.\n\nGenerated by FigCraft Motion Studio.\n`);
    const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
    download(blob,`${fileName(project.name)}-website.zip`);
    setStatus("Website package exported");
  };
  const exportRuntimeSource=()=>`(function(){
"use strict";
var GSAP="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js";
var SCROLL="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js";
function load(src){return new Promise(function(resolve,reject){var el=document.createElement("script");el.src=src;el.onload=resolve;el.onerror=function(){reject(new Error("Unable to load "+src));};document.head.appendChild(el);});}
function query(sel,scope){try{return sel?Array.prototype.slice.call((scope||document).querySelectorAll(sel)):[];}catch(e){return [];}}
function bp(){return innerWidth<=640?"mobile":innerWidth<=1023?"tablet":"desktop";}
function propValue(p,v){if(p==="opacity")return typeof v==="number"?v/100:Math.max(0,Math.min(1,(parseFloat(v)||0)/100));if(p==="visibility")return v==="hidden"||v==="autoAlpha:0"?0:1;if(p==="blur")return "blur("+v+"px)";if(p==="brightness")return "brightness("+(Number(v)/100)+")";if(p==="saturation")return "saturate("+(Number(v)/100)+")";if(p==="grayscale")return "grayscale("+(Number(v)/100)+")";if(p==="contrast")return "contrast("+(Number(v)/100)+")";return v;}
function ease(name){var m=/^cubic\\(([-+0-9.e]+),\\s*([-+0-9.e]+),\\s*([-+0-9.e]+),\\s*([-+0-9.e]+)\\)$/.exec(name);if(!m)return name;var a=m.slice(1).map(Number),bez=function(t,p1,p2){return 3*(1-t)*(1-t)*t*p1+3*(1-t)*t*t*p2+t*t*t;};return function(x){var lo=0,hi=1,t=Math.max(0,Math.min(1,x));for(var i=0;i<16;i++){if(bez(t,a[0],a[2])<x)lo=t;else hi=t;t=(lo+hi)/2;}return bez(t,a[1],a[3]);};}
function style(p,v){var key={x:"x",y:"y",z:"z",scaleX:"scaleX",scaleY:"scaleY",rotationX:"rotationX",rotationY:"rotationY",rotation:"rotation",skewX:"skewX",skewY:"skewY",transformOrigin:"transformOrigin",perspective:"perspective",top:"top",right:"right",bottom:"bottom",left:"left",opacity:"opacity",visibility:"autoAlpha",backgroundColor:"backgroundColor",color:"color",borderColor:"borderColor",borderRadius:"borderRadius",borderWidth:"borderWidth",boxShadow:"boxShadow",filter:"filter",blur:"filter",brightness:"filter",saturation:"filter",grayscale:"filter",contrast:"filter",fontSize:"fontSize",fontWeight:"fontWeight",letterSpacing:"letterSpacing",lineHeight:"lineHeight",wordSpacing:"wordSpacing",clipPath:"clipPath",width:"width",height:"height",padding:"padding",margin:"margin",strokeDashoffset:"strokeDashoffset",strokeDasharray:"strokeDasharray"}[p];var out={};if(key)out[key]=p==="filter"?String(v):propValue(p,v);return out;}
function splitText(el,mode){if(el.getAttribute("data-avab-split")==="true")return query(".avab-split-unit",el);var txt=el.textContent||"";el.textContent="";el.setAttribute("data-avab-split","true");var parts=mode==="words"||mode==="lines"?(txt.match(/\\S+\\s*/g)||[]):Array.from(txt);var out=[];parts.forEach(function(part){if(!part)return;var span=document.createElement("span");span.className="avab-split-unit";span.style.display="inline-block";span.style.whiteSpace="pre";span.textContent=part;el.appendChild(span);out.push(span);});if(mode!=="lines")return out;var groups=[],lastTop=NaN;out.forEach(function(unit){var top=unit.getBoundingClientRect().top;if(!Number.isFinite(lastTop)||Math.abs(top-lastTop)>1.5)groups.push([]);groups[groups.length-1].push(unit);lastTop=top;});el.textContent="";return groups.map(function(group){var line=document.createElement("span");line.className="avab-split-unit avab-split-line";line.style.display="block";line.style.overflow="hidden";group.forEach(function(unit){line.appendChild(unit);});el.appendChild(line);return line;});}
function start(project){
 var gsap=window.gsap,ST=window.ScrollTrigger;gsap.registerPlugin(ST);
 var instances=[],warnings=[],timer=0;
 function clear(){instances.forEach(function(x){x.clean.forEach(function(fn){try{fn();}catch(e){}});if(x.st)x.st.kill();x.tl.kill();});instances=[];}
 function warn(s){warnings.push(s);if(window.console&&console.warn)console.warn("[FigCraft Motion]",s);}
 function setup(){
  clear();warnings=[];
  var breakpoint=bp();
  project.sequences.forEach(function(seq,index){
   if(!seq.enabled)return;
   if(seq.motion.respectReducedMotion&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
   var trig=seq.trigger,root=query(trig.target)[0]||document.body;
   var tl=gsap.timeline({paused:true,repeat:seq.motion.repeat,repeatDelay:seq.motion.repeatDelay,yoyo:seq.motion.yoyo||seq.motion.direction==="alternate"||seq.motion.direction==="alternate-reverse",delay:seq.motion.delay,timeScale:Math.max(.05,seq.motion.speed),onStart:function(){window.dispatchEvent(new CustomEvent("avab:animation-start",{detail:{id:seq.id}}));},onComplete:function(){window.dispatchEvent(new CustomEvent("avab:animation-complete",{detail:{id:seq.id}}));}});
   if(seq.motion.direction==="reverse"||seq.motion.direction==="alternate-reverse")tl.reversed(true);
   seq.tracks.forEach(function(track,trackIndex){
    if(!track.enabled)return;
    var over=track.overrides&&track.overrides[breakpoint];if(over&&over.enabled===false)return;
    var keys=(over&&over.keyframes?over.keyframes:track.keyframes||[]).slice().sort(function(a,b){return a.at-b.at;});
    var nodes=query(track.target||trig.target);if(!nodes.length){warn("Missing target for "+track.label+": "+(track.target||trig.target));return;}
    var offset=(Number(track.startTime)||0)+trackIndex*Math.max(0,seq.motion.duration-seq.motion.overlap);
    var stagger=seq.motion.stagger?{each:seq.motion.staggerAmount,from:seq.motion.staggerFrom}:undefined;
    if(track.property==="textReveal"){
      nodes.forEach(function(node){var units=splitText(node,String(keys[0]&&keys[0].value||"words"));if(units.length)tl.fromTo(units,{y:24,autoAlpha:0},{y:0,autoAlpha:1,duration:Math.max(.05,Number(keys[keys.length-1]&&keys[keys.length-1].at)||seq.motion.duration),ease:(keys[keys.length-1]&&keys[keys.length-1].ease)||"power3.out",stagger:stagger||{each:.035}},offset);});
      return;
    }
    for(var i=1;i<keys.length;i++){
      var prev=keys[i-1],next=keys[i],from=style(track.property,prev.value),to=style(track.property,next.value);
      if(!Object.keys(from).length)continue;
      to.duration=Math.max(.001,Number(next.at)-Number(prev.at));to.ease=ease(next.ease||"power2.out");if(stagger)to.stagger=stagger;
      tl.fromTo(nodes,from,to,offset+Number(prev.at));
    }
   });
   var clean=[],st=null;
   function add(target,event,handler,options){target.addEventListener(event,handler,options);clean.push(function(){target.removeEventListener(event,handler,options);});}
   function play(){var delay=Number(trig.delay)||0;if(delay)window.setTimeout(function(){tl.restart();},delay);else tl.restart();}
   function scrollType(){return ["scrollIntoView","scrollCenter","scrollTop","scrollOut","enterFromBottom","enterFromTop","scrollDown","scrollUp","scrollProgress","whileScrollingInView","pageScrolling","pageScrolled"].indexOf(trig.type)>=0;}
   if(trig.type==="elementVisible"&&"IntersectionObserver"in window){
    var visibleObserver=new IntersectionObserver(function(entries){if(entries.some(function(entry){return entry.isIntersecting;})){tl.restart();if(trig.once)visibleObserver.disconnect();}},{threshold:Math.max(0,Math.min(1,(trig.threshold||120)/1000))});
    visibleObserver.observe(root);clean.push(function(){visibleObserver.disconnect();});
   }else if(scrollType()){
    var scrollTrigger=trig.type==="pageScrolling"||trig.type==="pageScrolled"?document.documentElement:root;
    var scroller=trig.scroller?query(trig.scroller)[0]:window;
    var start=trig.start||"top 85%";
    if(trig.start==="top 85%"){if(trig.type==="scrollCenter")start="top center";if(trig.type==="scrollTop")start="top top";if(trig.type==="scrollOut"||trig.type==="enterFromTop")start="bottom top";if(trig.type==="enterFromBottom")start="top bottom";if(trig.type==="pageScrolled")start="top -"+(trig.threshold||120);}
    var scrub=trig.scrub||trig.type==="scrollProgress"||trig.type==="whileScrollingInView"||trig.type==="pageScrolling";
    st=ST.create({trigger:scrollTrigger,scroller:scroller,start:start,end:trig.type==="pageScrolling"?function(){return Math.max(document.documentElement.scrollHeight-innerHeight,innerHeight);}:trig.end||"bottom 15%",horizontal:!!trig.horizontal,animation:tl,scrub:scrub?(trig.smoothing>0?trig.smoothing:true):false,pin:trig.pin?(query(trig.pinTarget)[0]||root):false,pinSpacing:trig.pinSpacing!==false,toggleActions:trig.toggleActions||"play none none reverse",once:!!trig.once,markers:!!trig.markers,snap:trig.snap>0?{snapTo:1/trig.snap,duration:.25,delay:.1,ease:"power1.inOut"}:undefined,onUpdate:function(self){if(trig.type==="scrollDown"&&self.direction>0)tl.play();if(trig.type==="scrollUp"&&self.direction<0)tl.play();if(trig.type==="pageScrolled"&&self.progress>0)tl.play();}});
   }else if(trig.type==="elementVisible"&&"IntersectionObserver"in window){
    var io=new IntersectionObserver(function(entries){if(entries.some(function(e){return e.isIntersecting;})){tl.restart();if(trig.once)io.disconnect();}},{threshold:Math.max(0,Math.min(1,(trig.threshold||120)/1000))});io.observe(root);clean.push(function(){io.disconnect();});
   }else{
    var ev={elementClick:"click",buttonClick:"click",elementHover:"mouseenter",mouseEnter:"mouseenter",mouseLeave:"mouseleave",doubleClick:"dblclick",pointerDown:"pointerdown",pointerUp:"pointerup"}[trig.type];
    if(ev){add(root,ev,play);if(trig.type==="elementHover")add(root,"mouseleave",function(){tl.reverse();});}
    else if(trig.type==="mouseMove"||trig.type==="drag"){var down=false;add(root,"pointerdown",function(){down=true;});add(window,"pointerup",function(){down=false;});add(root,"pointermove",function(e){if(trig.type==="drag"&&!down)return;var b=root.getBoundingClientRect(),v=trig.horizontal?(e.clientX-b.left)/Math.max(1,b.width):(e.clientY-b.top)/Math.max(1,b.height);tl.progress(Math.max(0,Math.min(1,v)));});}
    else if(trig.type==="customEvent")add(window,trig.eventName||"studio:animate",play);
    else if(trig.type==="classChange"){var mo=new MutationObserver(function(){if(root.classList.contains(trig.className))play();});mo.observe(root,{attributes:true,attributeFilter:["class"]});clean.push(function(){mo.disconnect();});}
    else if(trig.type==="navigation"){add(window,"popstate",play);add(window,"hashchange",play);}
    else if(trig.type==="pageTransition")add(window,"avab:page-transition",play);
    else if(trig.type==="animationStart"||trig.type==="animationComplete"){var type=trig.type==="animationStart"?"avab:animation-start":"avab:animation-complete";add(window,type,function(e){var id=e.detail&&e.detail.id;if(id!==seq.id&&(!trig.dependsOn||id===trig.dependsOn))play();});}
    else if(trig.type==="pageReady"){if(document.readyState==="complete"||document.readyState==="interactive")Promise.resolve(document.fonts&&document.fonts.ready).then(play);else add(document,"DOMContentLoaded",function(){Promise.resolve(document.fonts&&document.fonts.ready).then(play);},{once:true});}
    else if(["pageLoad","afterPageLoad","delay"].indexOf(trig.type)>=0){var fire=function(){if(trig.type==="delay"||trig.type==="afterPageLoad")window.setTimeout(play,Number(trig.delay)||0);else play();};if(trig.type==="delay")fire();else if(document.readyState==="complete")fire();else add(window,"load",fire,{once:true});}
   }
   instances.push({tl:tl,st:st,clean:clean});
  });
  if(warnings.length)window.dispatchEvent(new CustomEvent("avab:warnings",{detail:warnings}));
 }
 setup();
 window.addEventListener("resize",function(){clearTimeout(timer);timer=setTimeout(function(){setup();ST.refresh();},160);});
 window.addEventListener("pagehide",clear,{once:true});
 window.FigCraftMotion={refresh:function(){ST.refresh();},play:function(id,time){var found=project.sequences.find(function(s){return s.id===id;});if(found){var item=instances[project.sequences.indexOf(found)];if(item){if(typeof time==="number")item.tl.play(time);else item.tl.restart();}}},destroy:clear,warnings:warnings};
}
load(GSAP).then(function(){return load(SCROLL);}).then(function(){return fetch("./motion-project.json").then(function(r){if(!r.ok)throw new Error("Motion project could not be loaded");return r.json();});}).then(start).catch(function(error){console.error("[FigCraft Motion]",error);});
})();`;
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
    else if(el.getAttribute("data-avab-locked")==="true")el.removeAttribute("data-avab-locked");
    else el.setAttribute("data-avab-locked","true");
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
    copy.querySelectorAll("[data-avab-id]").forEach(child=>child.setAttribute("data-avab-id",makeId("layer")));
    el.parentElement.insertBefore(copy,el.nextSibling);
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layer duplicated");setSelected(newId);refreshLayers();
  };
  const groupLayer=(id:string)=>{
    const el=iframeRef.current?.contentDocument?.querySelector(selectorFor(id));
    if(!el?.parentElement)return;
    const wrapper=iframeRef.current!.contentDocument!.createElement("div");
    wrapper.setAttribute("data-avab-id",makeId("group"));wrapper.setAttribute("data-avab-name","Group");wrapper.setAttribute("data-avab-group","true");
    el.parentElement.insertBefore(wrapper,el);wrapper.appendChild(el);
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layer grouped");refreshLayers();
  };
  const ungroupLayer=(id:string)=>{
    const el=iframeRef.current?.contentDocument?.querySelector(selectorFor(id));
    if(!el?.parentElement||el.getAttribute("data-avab-group")!=="true")return;
    const parent=el.parentElement;
    [...el.children].forEach(child=>parent.insertBefore(child,el));
    el.remove();
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layer ungrouped");refreshLayers();
  };
  const moveLayerBefore=(fromId:string,toId:string)=>{
    if(!fromId||fromId===toId)return;
    const doc=iframeRef.current?.contentDocument;
    const from=doc?.querySelector(selectorFor(fromId)),to=doc?.querySelector(selectorFor(toId));
    if(!from||!to||!from.parentElement||from.parentElement!==to.parentElement)return;
    from.parentElement.insertBefore(from,to);
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layer order changed");refreshLayers();
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
    const frame=iframeRef.current,doc=frame?.contentDocument;
    if(!frame||!doc)return;
    const elements=doc.querySelectorAll<HTMLElement>(selectorForMany(selectedIds));
    if(!elements.length)return;
    elements.forEach(el=>{if(value==="auto"||value==="")el.style.removeProperty(property);else el.style.setProperty(property,value);});
    const html=serializeFrame(frame);
    commit(d=>{d.html=html;},`CSS ${property} updated`);
  };
  const readSelectedText=()=>{
    const el=iframeRef.current?.contentDocument?.querySelector(selectorFor(selected));
    return el?.textContent??"";
  };
  const writeSelectedText=(value:string)=>{
    const frame=iframeRef.current,doc=frame?.contentDocument;
    const el=doc?.querySelector(selectorFor(selected));
    if(!frame||!doc||!el)return;
    el.textContent=value;
    const html=serializeFrame(frame);
    commit(d=>{d.html=html;},"Text content updated");
    refreshLayers();
  };
  const addDesignElement=(kind:"frame"|"rectangle"|"ellipse"|"text"|"heading"|"button"|"divider")=>{
    const doc=iframeRef.current?.contentDocument;
    if(!doc)return;
    const selectedElement=doc.querySelector(selectorFor(selected));
    const selectedTag=selectedElement?.tagName.toLowerCase()??"";
    const canContain=["body","main","section","article","header","footer","nav","div","aside","ul","ol","li","form"].includes(selectedTag);
    const parent=kind==="frame"?doc.body:(selectedElement&&(canContain||selectedTag==="div"&&selectedElement.getAttribute("data-avab-group")==="true")?selectedElement:selectedElement?.parentElement??doc.body);
    const el=doc.createElement(kind==="heading"?"h2":kind==="button"?"button":kind==="divider"?"hr":kind==="text"?"p":"div");
    const id=makeId("design");
    const names={frame:"Frame",rectangle:"Rectangle",ellipse:"Ellipse",text:"Text",heading:"Heading",button:"Button",divider:"Divider"};
    el.setAttribute("data-avab-id",id);
    el.setAttribute("data-avab-name",names[kind]);
    el.setAttribute("data-avab-created","true");
    if(kind==="frame"){
      el.style.cssText="display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:16px;width:100%;min-height:260px;padding:32px;background:#f1f2f4;color:#15171b;border:1px solid #d7d9de;border-radius:8px;position:relative;box-sizing:border-box;";
      el.textContent="Frame";
    }else if(kind==="rectangle"){
      el.style.cssText="display:block;width:180px;height:120px;min-width:24px;min-height:24px;background:#d7f75b;border:1px solid #9ebc3e;border-radius:8px;position:relative;box-sizing:border-box;";
    }else if(kind==="ellipse"){
      el.style.cssText="display:block;width:120px;height:120px;min-width:24px;min-height:24px;background:#7cb7f2;border:1px solid #5289c0;border-radius:50%;position:relative;box-sizing:border-box;";
    }else if(kind==="text"){
      el.style.cssText="font:400 16px/1.5 Inter,Arial,sans-serif;color:#20232a;margin:0;min-width:80px;position:relative;";
      el.textContent="Add your text here";
    }else if(kind==="heading"){
      el.style.cssText="font:700 36px/1.1 Inter,Arial,sans-serif;letter-spacing:-.04em;color:#17191e;margin:0;position:relative;";
      el.textContent="Your heading";
    }else if(kind==="button"){
      el.style.cssText="display:inline-flex;align-items:center;justify-content:center;padding:12px 20px;background:#d7f75b;color:#15180e;border:0;border-radius:5px;font:700 13px Inter,Arial,sans-serif;cursor:pointer;position:relative;";
      el.textContent="Button";
    }else{
      el.style.cssText="display:block;width:100%;border:0;border-top:1px solid #b9bec7;margin:12px 0;position:relative;";
    }
    parent.appendChild(el);
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Design element added");
    setSelected(id);setSelectedIds([id]);setTab("Design");
    window.setTimeout(refreshLayers,60);
  };
  const addDesignImage=async(file:File)=>{
    const doc=iframeRef.current?.contentDocument;
    if(!doc)return;
    const data=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);
    });
    const img=doc.createElement("img");
    const id=makeId("image");
    img.src=data;img.alt=file.name;img.setAttribute("data-avab-id",id);img.setAttribute("data-avab-name",file.name);
    img.style.cssText="display:block;width:320px;max-width:100%;height:auto;object-fit:cover;border-radius:6px;position:relative;";
    const selectedElement=doc.querySelector(selectorFor(selected));
    const selectedTag=selectedElement?.tagName.toLowerCase()??"";
    const canContain=["body","main","section","article","header","footer","nav","div","aside"].includes(selectedTag);
    const parent=selectedElement&&(canContain||selectedElement.getAttribute("data-avab-group")==="true")?selectedElement:selectedElement?.parentElement??doc.body;
    parent.appendChild(img);
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Image added");
    setSelected(id);setSelectedIds([id]);setTab("Design");window.setTimeout(refreshLayers,60);
  };
  const deleteSelection=()=>{
    const doc=iframeRef.current?.contentDocument;
    if(!doc)return;
    selectedIds.forEach(id=>doc.querySelector(selectorFor(id))?.remove());
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Selected element(s) deleted");
    setSelected("");setSelectedIds([]);setSelectedLayer(null);window.setTimeout(refreshLayers,60);
  };
  const duplicateSelection=()=>{
    if(selectedIds.length===1)duplicateLayer(selectedIds[0]);
    else setStatus("Duplicate one layer at a time; multi-selection can be styled together.");
  };
  const alignSelection=(mode:"left"|"center"|"right"|"top"|"middle"|"bottom")=>{
    const doc=iframeRef.current?.contentDocument;
    if(!doc||selectedIds.length<2)return;
    const els=selectedIds.map(id=>doc.querySelector(selectorFor(id))).filter((el):el is HTMLElement=>el instanceof HTMLElement);
    if(els.length<2)return;
    const rects=els.map(el=>el.getBoundingClientRect());
    const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right));
    const top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));
    const centerX=(left+right)/2,centerY=(top+bottom)/2;
    els.forEach((el,i)=>{
      const r=rects[i];
      if(mode==="left"||mode==="center"||mode==="right"){
        const target=mode==="left"?left-r.left:mode==="right"?right-r.right:centerX-(r.left+r.width/2);
        const currentX=Number.parseFloat(el.style.translate.split(" ")[0])||0;
        el.style.translate=(currentX+target)+"px "+(el.style.translate.split(" ")[1]||"0px");
      }else{
        const target=mode==="top"?top-r.top:mode==="bottom"?bottom-r.bottom:centerY-(r.top+r.height/2);
        const pieces=(el.style.translate||"none").split(" ");
        const currentY=Number.parseFloat(pieces[1])||0;
        el.style.translate=(pieces[0]==="none"?"0px":pieces[0])+" "+(currentY+target)+"px";
      }
    });
    const html=serializeFrame(iframeRef.current!);
    commit(d=>{d.html=html;},"Layers aligned");
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
          {layers.map(layer=><div key={layer.id} draggable onDragStart={()=>setDragLayer(layer.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();moveLayerBefore(dragLayer,layer.id);setDragLayer("");}} className={"layer-row "+(selectedIds.includes(layer.id)?"selected":"")} style={{paddingLeft:10+layer.depth*12}} onClick={e=>{setSelected(layer.id);setSelectedIds(current=>e.shiftKey?(current.includes(layer.id)?current.filter(x=>x!==layer.id):[...current,layer.id]):[layer.id]);}}>
            <span className="layer-type">{layer.tag==="img"?"▧":layer.tag==="svg"?"◇":layer.tag.startsWith("h")?"T":layer.tag==="button"?"▱":"▣"}</span>
            {renaming===layer.id?<input autoFocus value={layer.name} onChange={e=>setLayers(old=>old.map(x=>x.id===layer.id?{...x,name:e.target.value}:x))} onBlur={e=>{renameLayer(layer.id,e.currentTarget.value);setRenaming("");}} onKeyDown={e=>{if(e.key==="Enter"){renameLayer(layer.id,layer.name);setRenaming("");}}}/>:<span className="layer-name" onDoubleClick={e=>{e.stopPropagation();setRenaming(layer.id);}}>{layer.name}</span>}
            <button title="Hide/show" onClick={e=>{e.stopPropagation();toggleLayer(layer.id,"hidden");}}>◉</button><button title="Lock/unlock" onClick={e=>{e.stopPropagation();toggleLayer(layer.id,"locked");}}>⌑</button>
            {selected===layer.id&&<div className="layer-more"><button title="Move up" onClick={e=>{e.stopPropagation();moveLayer(layer.id,-1);}}>↑</button><button title="Move down" onClick={e=>{e.stopPropagation();moveLayer(layer.id,1);}}>↓</button><button title="Duplicate" onClick={e=>{e.stopPropagation();duplicateLayer(layer.id);}}>⧉</button><button title="Group" onClick={e=>{e.stopPropagation();groupLayer(layer.id);}}>⊞</button>{layer.isGroup&&<button title="Ungroup" onClick={e=>{e.stopPropagation();ungroupLayer(layer.id);}}>⊟</button>}</div>}
          </div>)}
        </div>
        <div className="left-footer"><div className="panel-section-title"><span>ANIMATION SEQUENCES</span><button onClick={()=>addSequence()}>＋</button></div>
          {project.sequences.map(s=><div className={"sequence-row "+(s.id===currentSequence?.id?"selected":"")} key={s.id} onClick={()=>{setActiveSequenceId(s.id);setActiveTrackId("");}}><span className="sequence-dot"/><span>{s.name}</span><button onClick={e=>{e.stopPropagation();commit(d=>{d.sequences=d.sequences.filter(x=>x.id!==s.id);});}}>×</button></div>)}
          <button className="add-sequence" onClick={()=>addSequence()}>＋ Create animation</button>
        </div>
      </aside>
      <section className="center-workspace">
        <div className="canvas-toolbar">
          <div><b>DESIGN CANVAS</b><span className="canvas-url">/ {project.name.toLowerCase().replace(/\s+/g,"-")}</span></div>
          <div className="insert-tools">
            <button onClick={()=>addDesignElement("frame")} title="Add frame">＋ Frame</button>
            <button onClick={()=>addDesignElement("rectangle")} title="Add rectangle">▰ Rect</button>
            <button onClick={()=>addDesignElement("ellipse")} title="Add ellipse">◯ Ellipse</button>
            <button onClick={()=>addDesignElement("text")} title="Add text">T Text</button>
            <button onClick={()=>addDesignElement("heading")} title="Add heading">H Heading</button>
            <button onClick={()=>addDesignElement("button")} title="Add button">▱ Button</button>
            <button onClick={()=>designImageRef.current?.click()} title="Add image">▧ Image</button>
            <button onClick={()=>addDesignElement("divider")} title="Add divider">— Line</button>
            <input ref={designImageRef} hidden type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)void addDesignImage(file);e.currentTarget.value="";}}/>
          </div>
          <div className="canvas-tools-right"><span className="canvas-badge">{breakpoint.toUpperCase()} · DOM</span><button onClick={()=>refreshPreview()}>↻</button><button onClick={deleteSelection} disabled={!selectedIds.length} title="Delete selection">⌫</button></div>
        </div>
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
            <button className="play-icon" onClick={()=>{if(!currentSequence)return;controllerRef.current?.playFrom(currentSequence.id,playhead);setPlaying(true);}} title="Play from playhead">{playing?"↻":"▶"}</button>
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
              <div className="track-lane">{track.keyframes.map(key=><button key={key.id} className="keyframe-diamond" style={{left:`${(((draggingKeyframe?.trackId===track.id&&draggingKeyframe.keyId===key.id)?draggingKeyframe.at:key.at)+track.startTime)/duration*100}%`}} title={`${key.at}s: ${key.value}`} onPointerDown={e=>startKeyframeDrag(e,track,key)} onClick={e=>{e.stopPropagation();setActiveTrackId(track.id);setPlayhead(track.startTime+key.at);controllerRef.current?.seek(currentSequence?.id??"",track.startTime+key.at);}} onDoubleClick={e=>{e.stopPropagation();if(window.confirm("Delete this keyframe?"))commit(d=>{const t=d.sequences.find(x=>x.id===currentSequence?.id)?.tracks.find(x=>x.id===track.id);if(t)t.keyframes=t.keyframes.filter(k=>k.id!==key.id);});}}/>)}</div>
            </div>)}
            {currentSequence?.tracks.length===0&&<div className="empty-timeline">Add a property action to create your first animation track.</div>}
          </div>
          <div className="timeline-playhead" style={{left:`${playhead/duration*100}%`}}/>
          <input className="playhead-slider" type="range" min="0" max={duration} step=".01" value={playhead} onChange={e=>scrub(Number(e.target.value))}/></div>
          <div className="timeline-bottom"><span>{currentSequence?.tracks.length??0} ACTION TRACKS</span><span>DOUBLE-CLICK A DIAMOND TO REMOVE A KEYFRAME · DRAG TIMING IN THE INSPECTOR</span></div>
        </section>
      </section>
      <aside className="right-panel">
        <div className="inspector-header"><div><b>{tab==="Design"?"Design Inspector":"Animation Inspector"}</b><small>{selectedIds.length>1?`${selectedIds.length} elements selected`:selectedLayer?.name??"No element selected"}</small></div><button onClick={()=>setShowPresets(v=>!v)}>✦ Presets</button></div>
        <nav className="inspector-tabs">{(["Design","Trigger","Animate","Timeline","Motion","Advanced"] as Tab[]).map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}</button>)}</nav>
        <div className="inspector-content">
          {tab==="Design"&&<DesignInspector key={selectedIds.join(",")} selectedCount={selectedIds.length} selectedText={readSelectedText()} readCss={readCss} writeCss={writeCss} writeText={writeSelectedText} deleteSelection={deleteSelection} duplicateSelection={duplicateSelection} alignSelection={alignSelection}/>}
          {tab==="Trigger"&&<TriggerInspector sequence={currentSequence} update={updateTrigger} updateName={name=>updateSequence({name})} addSequence={addSequence} duplicateSequence={duplicateSequence}/>}
          {tab==="Animate"&&<AnimateInspector addTrack={addTrack} track={currentTrack} updateTrack={updateTrack} removeTrack={removeTrack} addKeyframe={addKeyframe} savePreset={saveCurrentPreset} copyTrack={copyTrack} pasteTrack={pasteTrack} duplicateTrack={duplicateTrack} hasClipboard={Boolean(trackClipboard)} selected={selected}/>}
          {tab==="Timeline"&&<TimelineInspector sequence={currentSequence} track={currentTrack} updateKeyframe={updateKeyframe} playhead={playhead}/>}
          {tab==="Motion"&&<MotionInspector sequence={currentSequence} update={updateMotion}/>}
          {tab==="Advanced"&&<AdvancedInspector sequence={currentSequence} updateTrigger={updateTrigger} breakpoint={breakpoint} track={currentTrack} commit={commit} readCss={readCss} writeCss={writeCss}/>}
        </div>
        <div className="inspector-footer"><span className={previewMode?"green-dot":"amber-dot"}/>{status}</div>
      </aside>
    </main>
    {showPresets&&<div className="modal-backdrop" onClick={()=>setShowPresets(false)}><div className="preset-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><b>Animation presets</b><small>Apply editable property tracks to the selected layer.</small></div><button onClick={()=>setShowPresets(false)}>×</button></div><div className="preset-grid">{customPresets.map(p=><div className="custom-preset" key={p.id}><button onClick={()=>applyCustomPreset(p)}><span>CUSTOM</span><b>{p.label}</b><small>{PROPERTY_META[p.property].label}</small></button><button title="Delete custom preset" onClick={()=>setCustomPresets(items=>items.filter(x=>x.id!==p.id))}>×</button></div>)}{PRESETS.map(p=><button key={p.group+p.name} onClick={()=>applyPreset(p)}><span>{p.group.toUpperCase()}</span><b>{p.name}</b><small>{PROPERTY_META[p.property].label}</small></button>)}</div></div></div>}
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
function TriggerInspector({sequence,update,updateName,addSequence,duplicateSequence}:{sequence?:AnimationSequence;update:(v:Partial<AnimationSequence["trigger"]>)=>void;updateName:(name:string)=>void;addSequence:(t?:TriggerType)=>void;duplicateSequence:()=>void}){
 if(!sequence)return <div className="empty-inspector"><b>No sequence</b><p>Create an animation to configure its trigger.</p><button className="primary-action" onClick={()=>addSequence()}>＋ New animation</button></div>;
 return <><Section title="Sequence"><Field label="Animation name" value={sequence.name} onChange={v=>updateName(String(v))}/><button className="wide-outline" onClick={duplicateSequence}>⧉ Duplicate sequence</button></Section><Section title="Trigger type"><select className="wide-select" value={sequence.trigger.type} onChange={e=>update({type:e.target.value as TriggerType})}>{TRIGGER_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>)}</select><small className="helper">{TRIGGER_GROUPS.flatMap(g=>g.options).find(o=>o.id===sequence.trigger.type)?.description}</small></Section>
 <Section title="Trigger target"><Field label="CSS selector" value={sequence.trigger.target||"[data-avab-id]"} onChange={v=>update({target:String(v)})}/><Field label="Scroller selector" value={sequence.trigger.scroller} onChange={v=>update({scroller:String(v)})}/><Field label="Custom event name" value={sequence.trigger.eventName} onChange={v=>update({eventName:String(v)})}/><Field label="Class to observe" value={sequence.trigger.className} onChange={v=>update({className:String(v)})}/></Section>
 <Section title="Scroll boundaries"><Field label="Start" value={sequence.trigger.start} onChange={v=>update({start:String(v)})}/><Field label="End" value={sequence.trigger.end} onChange={v=>update({end:String(v)})}/><div className="boundary-visual"><div className="viewport-mini"><i className="viewport-line start"/><i className="viewport-line end"/><span>VIEWPORT</span></div><div><b>{sequence.trigger.start}</b><small>START POSITION</small><b>{sequence.trigger.end}</b><small>END POSITION</small></div></div><Field label="Scrub progress" value={sequence.trigger.scrub} type="checkbox" onChange={v=>update({scrub:Boolean(v)})}/><Field label="Scrub smoothing" value={sequence.trigger.smoothing} unit="s" type="number" step={.1} onChange={v=>update({smoothing:Number(v)})}/><Field label="Horizontal scroll" value={sequence.trigger.horizontal} type="checkbox" onChange={v=>update({horizontal:Boolean(v)})}/></Section>
 <Section title="Scroll actions"><Field label="Pin element" value={sequence.trigger.pin} type="checkbox" onChange={v=>update({pin:Boolean(v)})}/><Field label="Pin target" value={sequence.trigger.pinTarget} onChange={v=>update({pinTarget:String(v)})}/><Field label="Pin spacing" value={sequence.trigger.pinSpacing} type="checkbox" onChange={v=>update({pinSpacing:Boolean(v)})}/><Field label="Toggle actions" value={sequence.trigger.toggleActions} onChange={v=>update({toggleActions:String(v)})}/><Field label="Once only" value={sequence.trigger.once} type="checkbox" onChange={v=>update({once:Boolean(v)})}/><Field label="Reverse on scroll up" value={sequence.trigger.reverse} type="checkbox" onChange={v=>update({reverse:Boolean(v)})}/><Field label="Snap points" value={sequence.trigger.snap} type="number" onChange={v=>update({snap:Number(v)})}/><Field label="Debug markers" value={sequence.trigger.markers} type="checkbox" onChange={v=>update({markers:Boolean(v)})}/></Section>
 <Section title="Event settings"><Field label="Delay" value={sequence.trigger.delay} unit="ms" type="number" onChange={v=>update({delay:Number(v)})}/><Field label="Visibility threshold" value={sequence.trigger.threshold} unit="px" type="number" onChange={v=>update({threshold:Number(v)})}/><Field label="Depends on sequence ID" value={sequence.trigger.dependsOn} onChange={v=>update({dependsOn:String(v)})}/></Section></>;
}
function AnimateInspector({addTrack,track,updateTrack,removeTrack,addKeyframe,savePreset,copyTrack,pasteTrack,duplicateTrack,hasClipboard,selected}:{addTrack:(p:AnimProperty)=>void;track?:PropertyTrack;updateTrack:(v:Partial<PropertyTrack>)=>void;removeTrack:()=>void;addKeyframe:()=>void;savePreset:()=>void;copyTrack:()=>void;pasteTrack:()=>void;duplicateTrack:()=>void;hasClipboard:boolean;selected:string}){
 return <><Section title="Add property action">{PROPERTY_GROUPS.map(g=><div className="property-group" key={g.label}><b>{g.label}</b><div className="property-buttons">{g.properties.map(p=><button key={p} onClick={()=>addTrack(p)}>{PROPERTY_META[p].label}</button>)}</div></div>)}</Section>
 {track?<Section title={`Selected action · ${track.label}`}><Field label="Action name" value={track.label} onChange={v=>updateTrack({label:String(v)})}/><Field label="Target selector" value={track.target} onChange={v=>updateTrack({target:String(v)})}/><Field label="Track start time" value={track.startTime} unit="s" type="number" step={.05} onChange={v=>updateTrack({startTime:Math.max(0,Number(v))})}/><Field label="Property" value={track.property} type="select" options={PROPERTY_GROUPS.flatMap(g=>g.properties)} onChange={v=>updateTrack({property:v as AnimProperty})}/><Field label="Enabled" value={track.enabled} type="checkbox" onChange={v=>updateTrack({enabled:Boolean(v)})}/><div className="keyframe-editor">{track.keyframes.map((k,i)=><div className="keyframe-row" key={k.id}><b>K{i+1}</b><Field label="Time" value={k.at} unit="s" type="number" step={.01} onChange={v=>updateTrack({keyframes:track.keyframes.map(x=>x.id===k.id?{...x,at:Number(v)}:x)})}/><Field label="Value" value={k.value} onChange={v=>updateTrack({keyframes:track.keyframes.map(x=>x.id===k.id?{...x,value:typeof v==="boolean"?String(v):v}:x)})}/><button onClick={()=>updateTrack({keyframes:track.keyframes.filter(x=>x.id!==k.id)})}>×</button></div>)}</div><button className="wide-outline" onClick={addKeyframe}>＋ Add keyframe at playhead</button><div className="action-clipboard"><button className="wide-outline" onClick={copyTrack}>Copy action</button><button className="wide-outline" disabled={!hasClipboard} onClick={pasteTrack}>Paste action</button><button className="wide-outline" onClick={duplicateTrack}>Duplicate action</button></div><button className="wide-outline" onClick={savePreset}>✦ Save as reusable preset</button><button className="wide-danger" onClick={removeTrack}>Remove action</button></Section>:<div className="empty-inspector"><p>Add a property action, then select its track to edit keyframes and targets.</p></div>}</>;
}
function TimelineInspector({sequence,track,updateKeyframe,playhead}:{sequence?:AnimationSequence;track?:PropertyTrack;updateKeyframe:(trackId:string,keyId:string,patch:Partial<Keyframe>)=>void;playhead:number}){
 if(!sequence||!track)return <div className="empty-inspector"><p>Select an animation track to edit its keyframes.</p></div>;
 return <><Section title="Keyframe editor"><p className="helper">Selected track: {track.label}</p>{track.keyframes.map((k,i)=><div className="keyframe-card" key={k.id}><div className="keyframe-card-head"><b>KEYFRAME {i+1}</b><small>{k.id}</small></div><Field label="Timeline position" value={k.at} unit="s" type="number" step={.01} onChange={v=>updateKeyframe(track.id,k.id,{at:Number(v)})}/><Field label="Value" value={k.value} onChange={v=>updateKeyframe(track.id,k.id,{value:typeof v==="boolean"?String(v):v})}/><Field label="Easing" value={k.ease.startsWith("cubic(")?"custom-bezier":k.ease} type="select" options={EASINGS} onChange={v=>updateKeyframe(track.id,k.id,{ease:v==="custom-bezier"?"cubic(0.25,0.1,0.25,1)":String(v)})}/>{k.ease.startsWith("cubic(")&&<BezierEditor value={k.ease} onChange={value=>updateKeyframe(track.id,k.id,{ease:value})}/>}</div>)}<div className="helper">Current playhead: {playhead.toFixed(2)}s. Keyframe timing is saved to the project.</div></Section></>;
}
function BezierEditor({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const match=value.match(/^cubic\\(([-+0-9.e]+),\\s*([-+0-9.e]+),\\s*([-+0-9.e]+),\\s*([-+0-9.e]+)\\)$/);
 const points=(match?match.slice(1).map(Number):[.25,.1,.25,1]) as [number,number,number,number];
 const [x1,y1,x2,y2]=points;
 const [dragging,setDragging]=useState<0|1|null>(null);
 const svgRef=useRef<SVGSVGElement>(null);
 const updatePoint=(index:0|1,x:number,y:number)=>{
  const next=[...points] as [number,number,number,number];
  next[index*2]=Math.max(0,Math.min(1,x));next[index*2+1]=Math.max(0,Math.min(1,y));
  onChange("cubic("+next.map(v=>Number(v.toFixed(3))).join(",")+")");
 };
 const move=(event:React.PointerEvent<SVGSVGElement>)=>{
  if(dragging===null||!svgRef.current)return;
  const rect=svgRef.current.getBoundingClientRect();
  const x=(event.clientX-rect.left)/rect.width;
  const y=1-(event.clientY-rect.top)/rect.height;
  updatePoint(dragging,(x-.07)/.86,(y-.12)/.76);
 };
 const p1={x:16+x1*188,y:105-y1*90},p2={x:16+x2*188,y:105-y2*90};
 return <div className="bezier-editor">
  <div className="bezier-head"><b>CUBIC BEZIER</b><small>DRAG THE CONTROL POINTS</small></div>
  <svg ref={svgRef} viewBox="0 0 220 120" onPointerDown={event=>{const handle=(event.target as SVGElement).getAttribute("data-handle");if(handle==="0"||handle==="1"){setDragging(Number(handle) as 0|1);event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();}}} onPointerMove={move} onPointerUp={()=>setDragging(null)} onPointerCancel={()=>setDragging(null)}>
   <path d="M 16 105 L 204 15" className="bezier-diagonal"/>
   <path d="M 16 105 L 16 15 L 204 15" className="bezier-guides"/>
   <line x1="16" y1="105" x2={p1.x} y2={p1.y} className="bezier-handle-line"/>
   <line x1="204" y1="15" x2={p2.x} y2={p2.y} className="bezier-handle-line"/>
   <path d={`M 16 105 C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, 204 15`} className="bezier-curve"/>
   <circle cx={p1.x} cy={p1.y} r="6" data-handle="0" className="bezier-handle"/>
   <circle cx={p2.x} cy={p2.y} r="6" data-handle="1" className="bezier-handle"/>
  </svg>
  <div className="bezier-values">
   {(["X1","Y1","X2","Y2"] as const).map((label,i)=><Field key={label} label={label} value={points[i]} type="number" step={.01} onChange={v=>updatePoint(Math.floor(i/2) as 0|1,i%2===0?Number(v):points[i-1],i%2===1?Number(v):points[i+1])}/>)}
  </div>
 </div>;
}
function MotionInspector({sequence,update}:{sequence?:AnimationSequence;update:(v:Partial<AnimationSequence["motion"]>)=>void}){
 if(!sequence)return null;const m=sequence.motion;
 return <><Section title="Timing"><Field label="Duration" value={m.duration} unit="s" type="number" step={.05} onChange={v=>update({duration:Number(v)})}/><Field label="Delay" value={m.delay} unit="s" type="number" step={.05} onChange={v=>update({delay:Number(v)})}/><Field label="Playback speed" value={m.speed} unit="×" type="number" step={.1} onChange={v=>update({speed:Number(v)})}/><Field label="Direction" value={m.direction} type="select" options={["normal","reverse","alternate","alternate-reverse"]} onChange={v=>update({direction:v as AnimationSequence["motion"]["direction"]})}/></Section><Section title="Repeat"><Field label="Repeat count (-1 = infinite)" value={m.repeat} type="number" onChange={v=>update({repeat:Number(v)})}/><Field label="Repeat delay" value={m.repeatDelay} unit="s" type="number" onChange={v=>update({repeatDelay:Number(v)})}/><Field label="Yoyo" value={m.yoyo} type="checkbox" onChange={v=>update({yoyo:Boolean(v)})}/></Section><Section title="Stagger"><Field label="Enable stagger" value={m.stagger} type="checkbox" onChange={v=>update({stagger:Boolean(v)})}/><Field label="Amount" value={m.staggerAmount} unit="s" type="number" step={.01} onChange={v=>update({staggerAmount:Number(v)})}/><Field label="Stagger from" value={m.staggerFrom} type="select" options={["start","center","edges","random","end"]} onChange={v=>update({staggerFrom:v as AnimationSequence["motion"]["staggerFrom"]})}/><Field label="Overlap" value={m.overlap} unit="s" type="number" step={.05} onChange={v=>update({overlap:Number(v)})}/></Section><Section title="Accessibility"><Field label="Respect reduced motion" value={m.respectReducedMotion} type="checkbox" onChange={v=>update({respectReducedMotion:Boolean(v)})}/></Section></>;
}
function AdvancedInspector({sequence,updateTrigger,breakpoint,track,commit,readCss,writeCss}:{sequence?:AnimationSequence;updateTrigger:(v:Partial<AnimationSequence["trigger"]>)=>void;breakpoint:Breakpoint;track?:PropertyTrack;commit:(f:(d:StudioProject)=>void,label?:string)=>void;readCss:(p:string)=>string;writeCss:(p:string,v:string)=>void}){
 if(!sequence)return null;
 const apply=(enabled:boolean)=>{if(!track)return;commit(d=>{const s=d.sequences.find(x=>x.id===sequence.id);const t=s?.tracks.find(x=>x.id===track.id);if(!t)return;t.overrides={...t.overrides,[breakpoint]:{enabled,keyframes:clone(t.overrides?.[breakpoint]?.keyframes??t.keyframes)}};},`${breakpoint} override changed`);};
 const current=track?.overrides?.[breakpoint];
 return <><Section title="Responsive breakpoint"><div className="breakpoint-pill">{breakpoint.toUpperCase()}</div><p className="helper">Overrides are stored per desktop, tablet and mobile. Disable this track or change its keyframe values for the active breakpoint.</p>{track&&<><Field label={`Enable on ${breakpoint}`} value={current?.enabled??true} type="checkbox" onChange={v=>apply(Boolean(v))}/>{(current?.keyframes??track.keyframes).map(k=><div className="keyframe-row" key={k.id}><b>{k.at}s</b><Field label="Value" value={k.value} onChange={v=>commit(d=>{const t=d.sequences.find(s=>s.id===sequence.id)?.tracks.find(x=>x.id===track.id);if(!t)return;const bp=t.overrides?.[breakpoint];if(bp)bp.keyframes=bp.keyframes.map(x=>x.id===k.id?{...x,value:typeof v==="boolean"?String(v):v}:x);else t.overrides={...t.overrides,[breakpoint]:{enabled:true,keyframes:t.keyframes.map(x=>x.id===k.id?{...x,value:typeof v==="boolean"?String(v):v}:x)}};})}/></div>)}</>}</Section><Section title="Advanced trigger"><Field label="Scroller selector" value={sequence.trigger.scroller} onChange={v=>updateTrigger({scroller:String(v)})}/><Field label="Horizontal" value={sequence.trigger.horizontal} type="checkbox" onChange={v=>updateTrigger({horizontal:Boolean(v)})}/><Field label="Start marker" value={sequence.trigger.markers} type="checkbox" onChange={v=>updateTrigger({markers:Boolean(v)})}/><Field label="Page scrolled threshold" value={sequence.trigger.threshold} type="number" onChange={v=>updateTrigger({threshold:Number(v)})}/></Section><Section title="CSS position & layout"><p className="helper">Position is applied to the selected real DOM element. Sticky positioning needs a scrollable ancestor and an offset.</p><Field label="Position mode" value={readCss("position")} type="select" options={["static","relative","absolute","fixed","sticky"]} onChange={v=>writeCss("position",String(v))}/>{(["top","right","bottom","left"] as const).map(side=><Field key={side} label={side[0].toUpperCase()+side.slice(1)} value={readCss(side)} onChange={v=>writeCss(side,String(v))}/>)}<Field label="Z-index" value={readCss("z-index")} onChange={v=>writeCss("z-index",String(v))}/><Field label="Overflow" value={readCss("overflow")} type="select" options={["visible","hidden","clip","auto","scroll"]} onChange={v=>writeCss("overflow",String(v))}/><Field label="Pointer events" value={readCss("pointer-events")} type="select" options={["auto","none","visible","painted"]} onChange={v=>writeCss("pointer-events",String(v))}/></Section></>;
}
function DesignInspector({selectedCount,selectedText,readCss,writeCss,writeText,deleteSelection,duplicateSelection,alignSelection}:{selectedCount:number;selectedText:string;readCss:(property:string)=>string;writeCss:(property:string,value:string)=>void;writeText:(value:string)=>void;deleteSelection:()=>void;duplicateSelection:()=>void;alignSelection:(mode:"left"|"center"|"right"|"top"|"middle"|"bottom")=>void}){
 if(!selectedCount)return <div className="empty-inspector"><b>Design anything</b><p>Select an element in the canvas or create a Frame, Rectangle, Ellipse, Text, Image or Button.</p></div>;
 const tag=readCss("display");
 return <>
  <Section title="Selection"><div className="design-selection"><span className="selection-count">{selectedCount}</span><span>{selectedCount===1?"element selected":"elements selected"}</span><button onClick={duplicateSelection}>⧉</button><button onClick={deleteSelection}>⌫</button></div>
  {selectedCount===1&&<TextContentEditor value={selectedText} onSave={writeText}/>}</Section>
  <Section title="Position & size"><CssField label="Position" value={readCss("position")} type="select" options={["static","relative","absolute","fixed","sticky"]} onSave={v=>writeCss("position",v)}/><div className="design-grid-2"><CssField label="X / Left" value={readCss("left")} onSave={v=>writeCss("left",v)}/><CssField label="Y / Top" value={readCss("top")} onSave={v=>writeCss("top",v)}/><CssField label="Width" value={readCss("width")} onSave={v=>writeCss("width",v)}/><CssField label="Height" value={readCss("height")} onSave={v=>writeCss("height",v)}/><CssField label="Min width" value={readCss("min-width")} onSave={v=>writeCss("min-width",v)}/><CssField label="Min height" value={readCss("min-height")} onSave={v=>writeCss("min-height",v)}/><CssField label="Max width" value={readCss("max-width")} onSave={v=>writeCss("max-width",v)}/><CssField label="Max height" value={readCss("max-height")} onSave={v=>writeCss("max-height",v)}/></div><CssField label="Z-index" value={readCss("z-index")} onSave={v=>writeCss("z-index",v)}/></Section>
  <Section title="Layout"><CssField label="Display" value={readCss("display")} type="select" options={["block","inline","inline-block","flex","inline-flex","grid","none"]} onSave={v=>writeCss("display",v)}/><CssField label="Direction" value={readCss("flex-direction")} type="select" options={["row","column","row-reverse","column-reverse"]} onSave={v=>writeCss("flex-direction",v)}/><CssField label="Justify" value={readCss("justify-content")} type="select" options={["flex-start","center","flex-end","space-between","space-around","space-evenly"]} onSave={v=>writeCss("justify-content",v)}/><CssField label="Align items" value={readCss("align-items")} type="select" options={["stretch","flex-start","center","flex-end","baseline"]} onSave={v=>writeCss("align-items",v)}/><CssField label="Gap" value={readCss("gap")} onSave={v=>writeCss("gap",v)}/><CssField label="Padding" value={readCss("padding")} onSave={v=>writeCss("padding",v)}/><CssField label="Margin" value={readCss("margin")} onSave={v=>writeCss("margin",v)}/><CssField label="Overflow" value={readCss("overflow")} type="select" options={["visible","hidden","clip","auto","scroll"]} onSave={v=>writeCss("overflow",v)}/></Section>
  <Section title="Fill & stroke"><CssField label="Fill / background" value={readCss("background-color")} type="color" onSave={v=>writeCss("background-color",v)}/><CssField label="Text color" value={readCss("color")} type="color" onSave={v=>writeCss("color",v)}/><CssField label="Border color" value={readCss("border-color")} type="color" onSave={v=>writeCss("border-color",v)}/><div className="design-grid-2"><CssField label="Border width" value={readCss("border-width")} onSave={v=>writeCss("border-width",v)}/><CssField label="Radius" value={readCss("border-radius")} onSave={v=>writeCss("border-radius",v)}/></div><CssField label="Border style" value={readCss("border-style")} type="select" options={["none","solid","dashed","dotted","double"]} onSave={v=>writeCss("border-style",v)}/><CssField label="Opacity" value={readCss("opacity")} onSave={v=>writeCss("opacity",v)}/></Section>
  <Section title="Typography"><CssField label="Font family" value={readCss("font-family")} onSave={v=>writeCss("font-family",v)}/><div className="design-grid-2"><CssField label="Font size" value={readCss("font-size")} onSave={v=>writeCss("font-size",v)}/><CssField label="Weight" value={readCss("font-weight")} type="select" options={["100","200","300","400","500","600","700","800","900"]} onSave={v=>writeCss("font-weight",v)}/><CssField label="Line height" value={readCss("line-height")} onSave={v=>writeCss("line-height",v)}/><CssField label="Letter spacing" value={readCss("letter-spacing")} onSave={v=>writeCss("letter-spacing",v)}/></div><CssField label="Text align" value={readCss("text-align")} type="select" options={["left","center","right","justify"]} onSave={v=>writeCss("text-align",v)}/><CssField label="Text transform" value={readCss("text-transform")} type="select" options={["none","uppercase","lowercase","capitalize"]} onSave={v=>writeCss("text-transform",v)}/></Section>
  <Section title="Effects"><CssField label="Box shadow" value={readCss("box-shadow")} onSave={v=>writeCss("box-shadow",v)}/><CssField label="Filter" value={readCss("filter")} onSave={v=>writeCss("filter",v)}/><CssField label="Transform" value={readCss("transform")} onSave={v=>writeCss("transform",v)}/><CssField label="Transform origin" value={readCss("transform-origin")} onSave={v=>writeCss("transform-origin",v)}/></Section>
  <Section title="Alignment">{selectedCount>1?<div className="align-grid">{(["left","center","right","top","middle","bottom"] as const).map(mode=><button key={mode} onClick={()=>alignSelection(mode)}>{mode}</button>)}</div>:<p className="helper">Select multiple layers to align their edges and centers relative to the current selection bounds.</p>}</Section>
 </>;
}
function CssField({label,value,onSave,type="text",options}:{label:string;value:string;onSave:(v:string)=>void;type?:"text"|"color"|"select";options?:string[]}){
 const [draft,setDraft]=useState(value);
 useEffect(()=>setDraft(value),[value]);
 const colorValue=()=>{
  const m=draft.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if(m)return "#"+m.slice(1,4).map(n=>Number(n).toString(16).padStart(2,"0")).join("");
  return /^#[0-9a-f]{6}$/i.test(draft)?draft:"#ffffff";
 };
 return <label className="field"><span>{label}</span><div className="field-control design-field-control">{type==="select"?<select value={draft} onChange={e=>{setDraft(e.target.value);onSave(e.target.value);}}>{(options??[]).map(v=><option value={v} key={v}>{v}</option>)}</select>:type==="color"?<><input type="color" value={colorValue()} onChange={e=>{setDraft(e.target.value);onSave(e.target.value);}}/><small>{draft}</small></>:<input type="text" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)onSave(draft);}} onKeyDown={e=>{if(e.key==="Enter"){(e.target as HTMLInputElement).blur();}}}/>}</div></label>;
}
function TextContentEditor({value,onSave}:{value:string;onSave:(value:string)=>void}){
 const [draft,setDraft]=useState(value);
 useEffect(()=>setDraft(value),[value]);
 return <label className="text-content-editor"><span>Text content</span><textarea value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)onSave(draft);}} rows={3}/><small>Edits save when you leave this field.</small></label>;
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
