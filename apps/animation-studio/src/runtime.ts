import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { AnimationSequence, AnimProperty, Breakpoint, PropertyTrack, StudioProject, TriggerType } from "./model";

gsap.registerPlugin(ScrollTrigger);
type Hooks={onSequenceStart?:(id:string)=>void;onSequenceComplete?:(id:string)=>void;onWarning?:(warnings:string[])=>void};
export interface AnimationController { play:(id:string)=>void; pause:(id:string)=>void; seek:(id:string,time:number)=>void; refresh:()=>void; destroy:()=>void; warnings:string[] }
type RuntimeItem={timeline:gsap.core.Timeline;trigger?:ScrollTrigger;cleanup:(()=>void)[];sequence:AnimationSequence};

const propMap:Partial<Record<AnimProperty,string>>={x:"x",y:"y",z:"z",scaleX:"scaleX",scaleY:"scaleY",rotationX:"rotationX",rotationY:"rotationY",rotation:"rotation",skewX:"skewX",skewY:"skewY",transformOrigin:"transformOrigin",perspective:"perspective",top:"top",right:"right",bottom:"bottom",left:"left",opacity:"opacity",visibility:"autoAlpha",backgroundColor:"backgroundColor",color:"color",borderColor:"borderColor",borderRadius:"borderRadius",borderWidth:"borderWidth",boxShadow:"boxShadow",blur:"filter",brightness:"filter",saturation:"filter",grayscale:"filter",contrast:"filter",fontSize:"fontSize",fontWeight:"fontWeight",letterSpacing:"letterSpacing",lineHeight:"lineHeight",wordSpacing:"wordSpacing",clipPath:"clipPath",width:"width",height:"height",padding:"padding",margin:"margin",strokeDashoffset:"strokeDashoffset",strokeDasharray:"strokeDasharray"};

const asNumber=(v:string|number)=>typeof v==="number"?v:Number.parseFloat(v)||0;
function cssValue(prop:AnimProperty,value:string|number):string|number{
 if(prop==="opacity")return typeof value==="number"?value/100:Math.max(0,Math.min(1,(Number.parseFloat(value)||0)/100));
 if(prop==="visibility")return value==="hidden"||value==="autoAlpha:0"?0:value==="autoAlpha:1"?1:1;
 if(prop==="blur")return `blur(${typeof value==="number"?value+"px":value})`;
 if(prop==="brightness"||prop==="saturation"||prop==="grayscale"||prop==="contrast")return `${prop==="brightness"?"brightness":prop==="saturation"?"saturate":prop==="grayscale"?"grayscale": "contrast"}(${typeof value==="number"?value/100:value})`;
 return value;
}
function targets(doc:Document,selector:string,fallback?:Element):Element[]{
 try{const found=selector?Array.from(doc.querySelectorAll(selector)):[];return found.length?found:fallback?[fallback]:[];}catch{return fallback?[fallback]:[];}
}
function splitText(el:Element,mode:string):HTMLElement[]{
 const html=el as HTMLElement;
 if(html.dataset.avabSplit==="true")return [...html.querySelectorAll<HTMLElement>(".avab-split-unit")];
 const text=html.textContent??"";
 const pieces=mode==="words"?text.split(/(\s+)/):Array.from(text);
 html.textContent="";
 html.dataset.avabSplit="true";
 const result:HTMLElement[]=[];
 for(const piece of pieces){
  if(!piece){continue;}
  if(/^\s+$/.test(piece)){html.append(document.createTextNode(piece));continue;}
  const span=html.ownerDocument.createElement("span");
  span.className="avab-split-unit";span.style.display="inline-block";span.style.whiteSpace="pre";
  span.textContent=piece;html.append(span);result.push(span);
 }
 return result;
}
function styleFor(track:PropertyTrack,value:string|number):Record<string,string|number>{
 const prop=track.property;
 if(prop==="filter")return {filter:String(value)};
 if(["blur","brightness","saturation","grayscale","contrast"].includes(prop)){
  const unit=prop==="blur"?"px":"";
  const n=asNumber(value);
  const converted=prop==="brightness"||prop==="saturation"||prop==="grayscale"||prop==="contrast"?n/100:n;
  const name=prop==="brightness"?"brightness":prop==="saturation"?"saturate":prop==="grayscale"?"grayscale":prop==="contrast"?"contrast":"blur";
  return {filter:`${name}(${converted}${unit})`};
 }
 const mapped=propMap[prop];
 if(!mapped)return {};
 return {[mapped]:cssValue(prop,value)};
}
function easeTracks(tl:gsap.core.Timeline,doc:Document,track:PropertyTrack,defaultTarget:string,offset:number,stagger:{each:number;from:string}|undefined,warnings:string[]){
 if(!track.enabled||!track.keyframes.length)return;
 const els=targets(doc,track.target||defaultTarget);
 if(!els.length){warnings.push(`No element found for ${track.label} target ${track.target||defaultTarget}`);return;}
 if(track.property==="textReveal"){
  for(const target of els){
   const units=splitText(target,String(track.keyframes[0]?.value??"words"));
   const last=track.keyframes.at(-1);
   if(!last)continue;
   tl.fromTo(units,{y:24,autoAlpha:0},{y:0,autoAlpha:1,duration:Math.max(.05,last.at),ease:last.ease||"power3.out",stagger:stagger??{each:.035},},offset);
  }
  return;
 }
 const keys=[...track.keyframes].sort((a,b)=>a.at-b.at);
 const first=keys[0];
 if(keys.length===1){
  tl.to(els,{...styleFor(track,first.value),duration:.01},offset);
  return;
 }
 for(let index=1;index<keys.length;index++){
  const from=keys[index-1],to=keys[index];
  const duration=Math.max(.001,to.at-from.at);
  const fromVars=styleFor(track,from.value);
  const toVars={...styleFor(track,to.value),duration,ease:to.ease||"power2.out",...(stagger?{stagger}:{})};
  if(track.property==="visibility")tl.fromTo(els,{autoAlpha:Number(fromVars.autoAlpha??fromVars.visibility??0)},{...toVars,autoAlpha:Number(to.value==="hidden"||to.value==="autoAlpha:0"?0:1)},offset+from.at);
  else tl.fromTo(els,fromVars,toVars,offset+from.at);
 }
}

function breakpointFor(win:Window):Breakpoint{return win.innerWidth<=640?"mobile":win.innerWidth<=1023?"tablet":"desktop";}
function isScroll(type:TriggerType){return ["scrollIntoView","scrollCenter","scrollTop","scrollOut","enterFromBottom","enterFromTop","scrollDown","scrollUp","scrollProgress","whileScrollingInView","pageScrolling","pageScrolled"].includes(type);}
function getStart(seq:AnimationSequence):string{
 if(seq.trigger.start!=="top 85%"||!seq.trigger.start)return seq.trigger.start;
 switch(seq.trigger.type){
  case "scrollCenter":return "top center";
  case "scrollTop":return "top top";
  case "scrollOut":return "bottom top";
  case "enterFromBottom":return "top bottom";
  case "enterFromTop":return "bottom top";
  case "pageScrolling":return "top top";
  case "pageScrolled":return `top -${seq.trigger.threshold}`;
  default:return seq.trigger.start;
 }
}
function makeTimeline(seq:AnimationSequence,doc:Document,hooks:Hooks,warnings:string[],breakpoint:Breakpoint):gsap.core.Timeline|null{
 const motion=seq.motion;
 if(motion.respectReducedMotion&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return null;
 const tl=gsap.timeline({paused:true,repeat:motion.repeat,repeatDelay:motion.repeatDelay,yoyo:motion.yoyo,timeScale:Math.max(.05,motion.speed),onStart:()=>{hooks.onSequenceStart?.(seq.id);window.dispatchEvent(new CustomEvent("avab:animation-start",{detail:{id:seq.id}}));},onComplete:()=>{hooks.onSequenceComplete?.(seq.id);window.dispatchEvent(new CustomEvent("avab:animation-complete",{detail:{id:seq.id}}));}});
 seq.tracks.forEach((track,index)=>{
  const override=track.overrides?.[breakpoint];
  if(override?.enabled===false)return;
  const activeTrack=override?.keyframes?{...track,keyframes:override.keyframes}:track;
  easeTracks(tl,doc,activeTrack,seq.trigger.target,0,motion.stagger?{each:motion.staggerAmount,from:motion.staggerFrom}:undefined,warnings);
 });
 if(motion.direction==="reverse")tl.reversed(true);
 if(motion.direction==="alternate"||motion.direction==="alternate-reverse")tl.yoyo(true);
 return tl;
}
export function mountAnimations(project:StudioProject,doc:Document,win:Window,hooks:Hooks={}):AnimationController{
 const items:RuntimeItem[]=[];
 const warnings:string[]=[];
 let dead=false;
 const cleanups:(()=>void)[]=[];
 const warn=(v:string)=>warnings.push(v);
 const current=breakpointFor(win);
 for(const seq of project.sequences){
  if(!seq.enabled)continue;
  const breakpoint=breakpointFor(win);
  const triggerTarget=targets(doc,seq.trigger.target)[0]??doc.body;
  const tl=makeTimeline(seq,doc,hooks,warnings,breakpoint);
  if(!tl)continue;
  const cleanup:(()=>void)[]=[];
  const add=(target:EventTarget,event:string,handler:EventListener,options?:AddEventListenerOptions)=>{
   target.addEventListener(event,handler,options);cleanup.push(()=>target.removeEventListener(event,handler,options));
  };
  const trigger=seq.trigger;
  let st:ScrollTrigger|undefined;
  if(isScroll(trigger.type)){
   const scroller=trigger.scroller?targets(doc,trigger.scroller)[0]:win;
   const scrub=trigger.scrub||trigger.type==="scrollProgress"||trigger.type==="whileScrollingInView"||trigger.type==="pageScrolling";
   st=ScrollTrigger.create({
    trigger:trigger.type==="pageScrolling"?doc.documentElement:triggerTarget,
    scroller:scroller as Element|Window,
    animation:tl,
    start:getStart(seq),
    end:trigger.type==="pageScrolling"?()=>Math.max(doc.documentElement.scrollHeight-win.innerHeight,win.innerHeight):trigger.end||"bottom 15%",
    horizontal:trigger.horizontal,
    scrub:scrub?(trigger.smoothing>0?trigger.smoothing:true):false,
    pin:trigger.pin?(trigger.pinTarget?targets(doc,trigger.pinTarget)[0]??triggerTarget:triggerTarget):false,
    pinSpacing:trigger.pinSpacing,
    toggleActions:trigger.toggleActions||"play none none reverse",
    once:trigger.once,
    markers:trigger.markers,
    snap:trigger.snap>0?{snapTo:1/trigger.snap,duration:.25,delay:.1,ease:"power1.inOut"}:false,
    onUpdate:self=>{
     if(trigger.type==="scrollDown"&&self.direction>0)tl.play();
     if(trigger.type==="scrollUp"&&self.direction<0)tl.play();
     if(trigger.type==="pageScrolled"&&self.progress>0)tl.play();
    }
   });
   cleanup.push(()=>st?.kill());
  }else if(trigger.type==="elementVisible"){
   const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){tl.restart();if(trigger.once)io.disconnect();}},{threshold:Math.max(0,Math.min(1,trigger.threshold/1000))});
   io.observe(triggerTarget);cleanup.push(()=>io.disconnect());
  }else{
   const play=()=>{if(trigger.delay>0)win.setTimeout(()=>tl.restart(),trigger.delay);else tl.restart();};
   const reverse=()=>tl.reverse();
   const events:Partial<Record<TriggerType,string>>={elementClick:"click",buttonClick:"click",elementHover:"mouseenter",mouseEnter:"mouseenter",mouseLeave:"mouseleave",doubleClick:"dblclick",pointerDown:"pointerdown",pointerUp:"pointerup"};
   const event=events[trigger.type];
   if(event){add(triggerTarget,event,play as EventListener);if(trigger.type==="elementHover")add(triggerTarget,"mouseleave",reverse as EventListener);}
   else if(trigger.type==="mouseMove"||trigger.type==="drag"){
    let down=false;
    add(triggerTarget,"pointerdown",(()=>{down=true;}) as EventListener);
    add(win,"pointerup",(()=>{down=false;}) as EventListener);
    add(triggerTarget,"pointermove",((e:PointerEvent)=>{if(trigger.type==="drag"&&!down)return;const b=triggerTarget.getBoundingClientRect();const progress=trigger.horizontal?(e.clientX-b.left)/Math.max(1,b.width):(e.clientY-b.top)/Math.max(1,b.height);tl.progress(Math.max(0,Math.min(1,progress)));}) as EventListener);
   }else if(trigger.type==="customEvent"){
    add(win,trigger.eventName||"studio:animate",play as EventListener);
   }else if(trigger.type==="classChange"){
    const observer=new MutationObserver(()=>{if(triggerTarget.classList.contains(trigger.className))play();});
    observer.observe(triggerTarget,{attributes:true,attributeFilter:["class"]});cleanup.push(()=>observer.disconnect());
   }else if(trigger.type==="navigation"){
    add(win,"popstate",play as EventListener);add(win,"hashchange",play as EventListener);
   }else if(trigger.type==="pageTransition"){
    add(win,"avab:page-transition",play as EventListener);
   }else if(trigger.type==="animationStart"||trigger.type==="animationComplete"){
    const eventName=trigger.type==="animationStart"?"avab:animation-start":"avab:animation-complete";
    const listener=((e:Event)=>{const id=(e as CustomEvent).detail?.id;if(!trigger.dependsOn||id===trigger.dependsOn)play();}) as EventListener;
    add(win,eventName,listener);
   }else if(["pageLoad","afterPageLoad","pageReady","delay"].includes(trigger.type)){
    const fire=()=>play();
    if(trigger.type==="pageReady"){
     if(doc.readyState==="complete"||doc.readyState==="interactive")void doc.fonts?.ready.then(fire);
     else add(doc,"DOMContentLoaded",(()=>void doc.fonts?.ready.then(fire)) as EventListener,{once:true});
    }else if(trigger.type==="delay"){const timer=win.setTimeout(fire,trigger.delay);cleanup.push(()=>win.clearTimeout(timer));}
    else if(trigger.type==="pageLoad"&&doc.readyState==="complete")fire();
    else add(win,"load",fire as EventListener,{once:true});
   }
  }
  items.push({timeline:tl,trigger:st,cleanup,sequence:seq});
 }
 hooks.onWarning?.(warnings);
 let resizeTimer=0;
 const refresh=()=>{if(dead)return;items.forEach(item=>{const bp=breakpointFor(win);if(bp===current)return;});ScrollTrigger.refresh();};
 win.addEventListener("resize",refresh);
 cleanups.push(()=>win.removeEventListener("resize",refresh));
 return {
  warnings,
  play:id=>items.find(x=>x.sequence.id===id)?.timeline.restart(),
  pause:id=>items.find(x=>x.sequence.id===id)?.timeline.pause(),
  seek:(id,time)=>{
   const item=items.find(x=>x.sequence.id===id);
   if(item){item.timeline.pause();item.timeline.time(Math.max(0,Math.min(item.timeline.duration(),time))); }
  },
  refresh:()=>{ScrollTrigger.refresh();},
  destroy:()=>{
   dead=true;win.removeEventListener("resize",refresh);
   items.forEach(item=>{item.cleanup.forEach(fn=>fn());item.timeline.kill();});
   cleanups.forEach(fn=>fn());
   ScrollTrigger.refresh();
  }
 };
}
