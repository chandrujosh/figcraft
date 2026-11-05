export type Breakpoint = "desktop" | "tablet" | "mobile";
export type TriggerType =
  | "pageLoad" | "afterPageLoad" | "pageReady" | "delay" | "pageTransition"
  | "elementClick" | "buttonClick" | "elementHover" | "mouseEnter" | "mouseLeave"
  | "doubleClick" | "mouseMove" | "pointerDown" | "pointerUp" | "drag"
  | "scrollIntoView" | "scrollCenter" | "scrollTop" | "scrollOut" | "enterFromBottom"
  | "enterFromTop" | "scrollDown" | "scrollUp" | "scrollProgress" | "whileScrollingInView"
  | "pageScrolling" | "pageScrolled" | "elementVisible" | "classChange" | "navigation"
  | "customEvent" | "animationStart" | "animationComplete";

export type AnimProperty =
  | "x" | "y" | "z" | "scaleX" | "scaleY" | "rotationX" | "rotationY" | "rotation"
  | "skewX" | "skewY" | "transformOrigin" | "perspective"
  | "top" | "right" | "bottom" | "left"
  | "opacity" | "visibility" | "backgroundColor" | "color" | "borderColor" | "borderRadius"
  | "borderWidth" | "boxShadow" | "filter" | "blur" | "brightness" | "saturation"
  | "grayscale" | "contrast" | "fontSize" | "fontWeight" | "letterSpacing" | "lineHeight"
  | "wordSpacing" | "clipPath" | "width" | "height" | "padding" | "margin"
  | "strokeDashoffset" | "strokeDasharray" | "textReveal";

export interface Keyframe {
  id: string;
  at: number;
  value: string | number;
  ease: string;
}
export interface BreakpointOverride {
  enabled: boolean;
  keyframes: Keyframe[];
}
export interface PropertyTrack {
  id: string;
  label: string;
  target: string;
  startTime: number;
  property: AnimProperty;
  enabled: boolean;
  keyframes: Keyframe[];
  overrides?: Partial<Record<Breakpoint, BreakpointOverride>>;
}
export interface TriggerSettings {
  type: TriggerType;
  target: string;
  start: string;
  end: string;
  scroller: string;
  scrub: boolean;
  smoothing: number;
  pin: boolean;
  pinTarget: string;
  pinSpacing: boolean;
  toggleActions: string;
  once: boolean;
  reverse: boolean;
  snap: number;
  markers: boolean;
  horizontal: boolean;
  threshold: number;
  delay: number;
  eventName: string;
  className: string;
  dependsOn: string;
}
export interface MotionSettings {
  duration: number;
  delay: number;
  repeat: number;
  repeatDelay: number;
  yoyo: boolean;
  speed: number;
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  stagger: boolean;
  staggerAmount: number;
  staggerFrom: "start" | "center" | "edges" | "random" | "end";
  overlap: number;
  respectReducedMotion: boolean;
}
export interface AnimationSequence {
  id: string;
  name: string;
  enabled: boolean;
  trigger: TriggerSettings;
  motion: MotionSettings;
  tracks: PropertyTrack[];
}
export interface StudioProject {
  version: 1;
  name: string;
  html: string;
  sequences: AnimationSequence[];
}
export interface LayerItem {
  id: string;
  name: string;
  tag: string;
  depth: number;
  parent: string;
  className: string;
}

export const PROPERTY_GROUPS: { label: string; properties: AnimProperty[] }[] = [
  { label: "Transform", properties: ["x", "y", "z", "scaleX", "scaleY", "rotationX", "rotationY", "rotation", "skewX", "skewY", "transformOrigin", "perspective"] },
  { label: "Position", properties: ["top", "right", "bottom", "left"] },
  { label: "Appearance", properties: ["opacity", "visibility", "backgroundColor", "color", "borderColor", "borderRadius", "borderWidth", "boxShadow", "filter", "blur", "brightness", "saturation", "grayscale", "contrast"] },
  { label: "Typography", properties: ["fontSize", "fontWeight", "letterSpacing", "lineHeight", "wordSpacing", "textReveal"] },
  { label: "Advanced", properties: ["clipPath", "width", "height", "padding", "margin", "strokeDashoffset", "strokeDasharray"] }
];

export const PROPERTY_META: Record<AnimProperty, { label: string; unit: string; kind: "number" | "text" | "color" | "select"; min?: number; max?: number; step?: number; options?: string[] }> = {
  x: { label: "Translate X", unit: "px", kind: "number", min: -2400, max: 2400 },
  y: { label: "Translate Y", unit: "px", kind: "number", min: -2400, max: 2400 },
  z: { label: "Translate Z", unit: "px", kind: "number", min: -2000, max: 2000 },
  scaleX: { label: "Scale X", unit: "×", kind: "number", min: 0, max: 8, step: 0.01 },
  scaleY: { label: "Scale Y", unit: "×", kind: "number", min: 0, max: 8, step: 0.01 },
  rotationX: { label: "Rotate X", unit: "°", kind: "number", min: -1440, max: 1440 },
  rotationY: { label: "Rotate Y", unit: "°", kind: "number", min: -1440, max: 1440 },
  rotation: { label: "Rotate Z", unit: "°", kind: "number", min: -1440, max: 1440 },
  skewX: { label: "Skew X", unit: "°", kind: "number", min: -180, max: 180 },
  skewY: { label: "Skew Y", unit: "°", kind: "number", min: -180, max: 180 },
  transformOrigin: { label: "Transform origin", unit: "", kind: "select", options: ["center center", "left top", "center top", "right top", "left center", "right center", "left bottom", "center bottom", "right bottom"] },
  perspective: { label: "Perspective", unit: "px", kind: "number", min: 0, max: 4000 },
  top: { label: "Top", unit: "px", kind: "number", min: -3000, max: 3000 },
  right: { label: "Right", unit: "px", kind: "number", min: -3000, max: 3000 },
  bottom: { label: "Bottom", unit: "px", kind: "number", min: -3000, max: 3000 },
  left: { label: "Left", unit: "px", kind: "number", min: -3000, max: 3000 },
  opacity: { label: "Opacity", unit: "%", kind: "number", min: 0, max: 100 },
  visibility: { label: "Visibility", unit: "", kind: "select", options: ["visible", "hidden", "autoAlpha:0", "autoAlpha:1"] },
  backgroundColor: { label: "Background color", unit: "", kind: "color" },
  color: { label: "Text color", unit: "", kind: "color" },
  borderColor: { label: "Border color", unit: "", kind: "color" },
  borderRadius: { label: "Border radius", unit: "px", kind: "number", min: 0, max: 1000 },
  borderWidth: { label: "Border width", unit: "px", kind: "number", min: 0, max: 100 },
  boxShadow: { label: "Box shadow", unit: "", kind: "text" },
  filter: { label: "CSS filter", unit: "", kind: "text" },
  blur: { label: "Blur", unit: "px", kind: "number", min: 0, max: 100 },
  brightness: { label: "Brightness", unit: "%", kind: "number", min: 0, max: 500 },
  saturation: { label: "Saturation", unit: "%", kind: "number", min: 0, max: 500 },
  grayscale: { label: "Grayscale", unit: "%", kind: "number", min: 0, max: 100 },
  contrast: { label: "Contrast", unit: "%", kind: "number", min: 0, max: 500 },
  fontSize: { label: "Font size", unit: "px", kind: "number", min: 1, max: 300 },
  fontWeight: { label: "Font weight", unit: "", kind: "select", options: ["100", "200", "300", "400", "500", "600", "700", "800", "900"] },
  letterSpacing: { label: "Letter spacing", unit: "px", kind: "number", min: -30, max: 100, step: 0.1 },
  lineHeight: { label: "Line height", unit: "", kind: "number", min: 0.5, max: 4, step: 0.05 },
  wordSpacing: { label: "Word spacing", unit: "px", kind: "number", min: -30, max: 100, step: 0.1 },
  clipPath: { label: "Clip path", unit: "", kind: "text" },
  width: { label: "Width", unit: "px", kind: "number", min: 0, max: 5000 },
  height: { label: "Height", unit: "px", kind: "number", min: 0, max: 5000 },
  padding: { label: "Padding", unit: "px", kind: "number", min: 0, max: 500 },
  margin: { label: "Margin", unit: "px", kind: "number", min: -500, max: 1000 },
  strokeDashoffset: { label: "SVG stroke offset", unit: "", kind: "number", min: -10000, max: 10000 },
  strokeDasharray: { label: "SVG stroke dash", unit: "", kind: "number", min: 0, max: 10000 },
  textReveal: { label: "Text reveal", unit: "", kind: "select", options: ["words", "characters", "lines", "mask"] }
};

export const TRIGGER_GROUPS: { label: string; options: { id: TriggerType; label: string; description: string }[] }[] = [
  { label: "Page / Load", options: [
    { id: "pageLoad", label: "Page load", description: "When the document load event fires." },
    { id: "afterPageLoad", label: "After page load", description: "After the window load event and the configured delay." },
    { id: "pageReady", label: "Page ready", description: "After DOM and fonts are ready." },
    { id: "delay", label: "After a delay", description: "Start after the configured delay." },
    { id: "pageTransition", label: "Page transition", description: "On a custom page transition event." }
  ]},
  { label: "Scroll", options: [
    { id: "scrollIntoView", label: "Scroll into view", description: "When the trigger enters the viewport." },
    { id: "scrollCenter", label: "Element reaches viewport center", description: "When its top reaches the center line." },
    { id: "scrollTop", label: "Element reaches viewport top", description: "When its top reaches the top line." },
    { id: "scrollOut", label: "Element leaves viewport", description: "When the trigger leaves the viewport." },
    { id: "enterFromBottom", label: "Enter from bottom", description: "When the trigger enters from the bottom." },
    { id: "enterFromTop", label: "Enter from top", description: "When the trigger enters from the top." },
    { id: "scrollDown", label: "Scrolling down", description: "Play while scrolling down through the trigger." },
    { id: "scrollUp", label: "Scrolling up", description: "Play while scrolling up through the trigger." },
    { id: "scrollProgress", label: "Scroll progress", description: "Link the timeline to scroll position." },
    { id: "whileScrollingInView", label: "While scrolling in view", description: "Scrub from entry to exit." },
    { id: "pageScrolling", label: "While page is scrolling", description: "Link to the entire page scroll range." },
    { id: "pageScrolled", label: "Page scrolled", description: "Fire after a scroll threshold." },
    { id: "elementVisible", label: "Element visibility", description: "Play when the element becomes visible." }
  ]},
  { label: "Mouse / Pointer", options: [
    { id: "elementClick", label: "Mouse click (tap)", description: "Play when the trigger is clicked." },
    { id: "buttonClick", label: "Button click", description: "Play when a button trigger is clicked." },
    { id: "elementHover", label: "Mouse hover", description: "Play on hover and reverse on leave." },
    { id: "mouseEnter", label: "Mouse enter", description: "Play when the pointer enters." },
    { id: "mouseLeave", label: "Mouse leave", description: "Play when the pointer leaves." },
    { id: "doubleClick", label: "Double click", description: "Play on double click." },
    { id: "mouseMove", label: "Mouse move over element", description: "Drive timeline progress with pointer X." },
    { id: "pointerDown", label: "Pointer down", description: "Play while the pointer is down." },
    { id: "pointerUp", label: "Pointer up", description: "Play on pointer release." },
    { id: "drag", label: "Drag interaction", description: "Drive timeline progress while dragging." }
  ]},
  { label: "Interaction / Continuous", options: [
    { id: "classChange", label: "Class / state change", description: "Observe a class change on the trigger." },
    { id: "navigation", label: "Navigation", description: "On browser back, forward or hash navigation." },
    { id: "customEvent", label: "Custom event", description: "Listen for a named browser custom event." },
    { id: "animationStart", label: "Another animation starts", description: "Start after another sequence begins." },
    { id: "animationComplete", label: "Another animation completes", description: "Start after another sequence completes." },
    { id: "pageTransition", label: "On page transition", description: "Listen for avab:page-transition." }
  ]}
];

export const EASINGS = [
  "none", "power1.in", "power1.out", "power1.inOut", "power2.in", "power2.out", "power2.inOut",
  "power3.in", "power3.out", "power3.inOut", "power4.in", "power4.out", "power4.inOut",
  "back.in(1.7)", "back.out(1.7)", "back.inOut(1.7)", "bounce.in", "bounce.out", "bounce.inOut",
  "elastic.in(1,0.3)", "elastic.out(1,0.3)", "circ.in", "circ.out", "circ.inOut", "expo.in", "expo.out",
  "expo.inOut", "sine.in", "sine.out", "sine.inOut"
];

export const makeId = (prefix = "id") => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export function defaultTrigger(type: TriggerType = "scrollIntoView"): TriggerSettings {
  return {
    type, target: "", start: "top 85%", end: "bottom 15%", scroller: "", scrub: false, smoothing: 0.5,
    pin: false, pinTarget: "", pinSpacing: true, toggleActions: "play none none reverse",
    once: false, reverse: true, snap: 0, markers: false, horizontal: false, threshold: 120,
    delay: 0, eventName: "studio:animate", className: "is-active", dependsOn: ""
  };
}
export function defaultMotion(): MotionSettings {
  return {
    duration: 1, delay: 0, repeat: 0, repeatDelay: 0, yoyo: false, speed: 1,
    direction: "normal", stagger: false, staggerAmount: 0.12, staggerFrom: "start",
    overlap: 0, respectReducedMotion: true
  };
}
export function createSequence(name = "New animation", type: TriggerType = "scrollIntoView"): AnimationSequence {
  return { id: makeId("seq"), name, enabled: true, trigger: defaultTrigger(type), motion: defaultMotion(), tracks: [] };
}
export function createTrack(property: AnimProperty, target: string, duration = 1): PropertyTrack {
  const defaults: Partial<Record<AnimProperty, [number | string, number | string]>> = {
    opacity: [0, 100], x: [-80, 0], y: [60, 0], z: [-100, 0], scaleX: [0.8, 1], scaleY: [0.8, 1],
    rotation: [-12, 0], rotationX: [-30, 0], rotationY: [-30, 0], skewX: [-8, 0], skewY: [-8, 0],
    backgroundColor: ["#1b1e29", "#d7f75b"], color: ["#8c91a3", "#ffffff"], borderColor: ["#242735", "#d7f75b"],
    borderRadius: [0, 24], blur: [14, 0], brightness: [70, 100], saturation: [0, 100], grayscale: [100, 0],
    contrast: [70, 100], fontSize: [20, 42], fontWeight: [400, 700], letterSpacing: [4, 0],
    lineHeight: [0.9, 1.15], wordSpacing: [8, 0], width: [0, 100], height: [0, 100],
    padding: [0, 24], margin: [0, 20], clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"],
    boxShadow: ["0 0 0 rgba(0,0,0,0)", "0 24px 80px rgba(0,0,0,.3)"],
    visibility: ["hidden", "visible"], filter: ["blur(12px) saturate(.4)", "blur(0px) saturate(1)"]
  };
  const [from, to] = defaults[property] ?? [0, 100];
  const unit = PROPERTY_META[property].unit;
  const format = (v: number | string) => typeof v === "number" && unit && unit !== "%" && unit !== "×" && unit !== "°" ? `${v}${unit}` : v;
  return {
    id: makeId("track"), label: PROPERTY_META[property].label, target, startTime: 0, property, enabled: true,
    keyframes: [
      { id: makeId("kf"), at: 0, value: format(from), ease: "power2.out" },
      { id: makeId("kf"), at: duration, value: format(to), ease: "power2.out" }
    ]
  };
}

export function makeSampleHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motion Studio Demo</title>
<style>
*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:#090b10;color:#f7f8fc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
a{color:inherit;text-decoration:none}.site-nav{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(24px,6vw,92px);border-bottom:1px solid #ffffff1b;position:relative;z-index:5}.brand{font-size:18px;font-weight:850;letter-spacing:-.05em}.brand span{color:#d7f75b}.nav-links{display:flex;gap:28px;color:#a9adba;font-size:12px}.nav-cta{background:#d7f75b;color:#11140b;padding:12px 18px;border-radius:3px;font-size:11px;font-weight:800}
.hero{min-height:650px;display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:36px;padding:80px clamp(24px,8vw,120px);background:radial-gradient(ellipse at 78% 48%,#2b3448 0%,#111722 29%,#090b10 68%);overflow:hidden}
.eyebrow{color:#d7f75b;font-size:10px;letter-spacing:.22em;text-transform:uppercase;font-weight:800}.hero h1{font-size:clamp(50px,7vw,104px);line-height:.9;letter-spacing:-.075em;margin:24px 0}.hero h1 em{color:#d7f75b;font-style:normal}.hero p{color:#a9adba;line-height:1.8;max-width:440px;font-size:14px}.hero-actions{display:flex;gap:12px;margin-top:34px}.primary{background:#d7f75b;color:#10130b;padding:16px 22px;font-size:11px;font-weight:850;border:0}.secondary{border:1px solid #ffffff38;color:#f7f8fc;padding:16px 22px;font-size:11px;background:transparent}
.machine{height:420px;position:relative;display:grid;place-items:center}.orbit{position:absolute;border:1px solid #d7f75b36;border-radius:50%;width:380px;height:380px}.orbit.two{width:300px;height:300px;border-color:#ffffff20}.orb-core{width:220px;height:220px;border-radius:50%;background:radial-gradient(circle at 30% 28%,#efffb1,#8ba835 24%,#252f20 60%,#0a0d11 75%);box-shadow:0 0 110px #c7f05237;display:grid;place-items:center;font-size:12px;font-weight:900;letter-spacing:.12em;color:#13180d}.orb-dot{position:absolute;width:18px;height:18px;border-radius:50%;background:#d7f75b;box-shadow:0 0 30px #d7f75b;top:50px;right:62px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);border-block:1px solid #ffffff20;padding:34px clamp(24px,8vw,120px);gap:20px}.stat strong{font-size:32px;letter-spacing:-.05em}.stat span{display:block;color:#8e94a3;font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-top:7px}
.section{padding:100px clamp(24px,8vw,120px)}.section-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:44px}.section h2{font-size:clamp(34px,5vw,64px);letter-spacing:-.065em;line-height:.95;margin:14px 0}.section-head p{color:#a9adba;max-width:300px;font-size:12px;line-height:1.7}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{padding:30px;min-height:240px;background:linear-gradient(145deg,#1b2230,#11151e);border:1px solid #ffffff18}.card .number{color:#d7f75b;font-size:10px;letter-spacing:.2em}.card h3{font-size:24px;letter-spacing:-.04em;margin-top:56px}.card p{color:#9ca2b1;line-height:1.7;font-size:12px}.wide{min-height:440px;background:linear-gradient(115deg,#d7f75b 0 42%,#a3bd43 42% 43%,#151b20 43%);display:flex;align-items:center;padding:60px clamp(24px,8vw,120px);color:#11140b}.wide h2{font-size:clamp(38px,6vw,78px);letter-spacing:-.07em;max-width:540px;line-height:.9}.wide p{max-width:400px;line-height:1.7;font-size:13px}.footer{padding:40px clamp(24px,8vw,120px);display:flex;justify-content:space-between;border-top:1px solid #ffffff20;color:#8e94a3;font-size:11px}
@media(max-width:760px){.hero{grid-template-columns:1fr;padding-top:60px}.machine{height:300px}.orbit{width:280px;height:280px}.orbit.two{width:220px;height:220px}.orb-core{width:160px;height:160px}.cards{grid-template-columns:1fr}.nav-links{display:none}.stats{grid-template-columns:1fr 1fr}.section-head{display:block}.wide{display:block}.footer{display:block;line-height:2}}
</style></head><body>
<nav class="site-nav"><div class="brand">FORM<span>FIELD</span></div><div class="nav-links"><a href="#platform">Platform</a><a href="#systems">Systems</a><a href="#contact">Contact</a></div><a class="nav-cta" href="#contact">EXPLORE THE PLATFORM ↗</a></nav>
<main>
<section class="hero" id="top"><div class="hero-copy"><div class="eyebrow">Independent motion systems / 2026</div><h1>Move with<br><em>intention.</em></h1><p>Design experiences that respond to every scroll, every gesture and every moment. Build expressive interfaces with a system made for motion.</p><div class="hero-actions"><a class="primary" href="#platform">DISCOVER THE SYSTEM ↗</a><a class="secondary" href="#systems">SEE THE DETAILS</a></div></div><div class="machine"><div class="orbit"></div><div class="orbit two"></div><div class="orb-dot"></div><div class="orb-core">MOTION / 01</div></div></section>
<section class="stats"><div class="stat"><strong>01—04</strong><span>Design principles</span></div><div class="stat"><strong>60fps</strong><span>Fluid by design</span></div><div class="stat"><strong>∞</strong><span>Ways to move</span></div></section>
<section class="section" id="platform"><div class="section-head"><div><div class="eyebrow">A new interaction language</div><h2>Make every<br>moment matter.</h2></div><p>Compose a visual rhythm that feels considered. Animate the details, connect the sections and make the entire experience feel alive.</p></div><div class="cards"><article class="card"><div class="number">01 / SCROLL</div><h3>Scroll stories</h3><p>Pin, scrub and reveal content as visitors move through your page.</p></article><article class="card"><div class="number">02 / INTERACTION</div><h3>Responsive gestures</h3><p>Make hover, click and pointer movement feel immediate and intentional.</p></article><article class="card"><div class="number">03 / SEQUENCE</div><h3>Timeline control</h3><p>Layer independent actions into a sequence with precise timing.</p></article></div></section>
<section class="wide" id="systems"><div><div class="eyebrow" style="color:#35451b">The next dimension</div><h2>Motion is a material.</h2><p>Control position, scale, color, typography and shape. Give every element a role in the story.</p></div></section>
<section class="section" id="contact"><div class="eyebrow">Start creating</div><h2>Build the feeling<br>you came for.</h2><p style="color:#a9adba;max-width:420px;line-height:1.8">This page is editable in Motion Studio. Select a layer, choose a trigger and compose the motion visually.</p></section>
</main><footer class="footer"><span>FORMFIELD / MOTION SYSTEMS</span><span>DESIGNED TO MOVE ↗</span></footer>
</body></html>`;
}

export function prepareHtml(input: string): string {
  const parsed = new DOMParser().parseFromString(input || makeSampleHtml(), "text/html");
  parsed.querySelectorAll("script, iframe, object, embed").forEach((el) => el.remove());
  parsed.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /^(href|src|xlink:href)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  let counter = 1;
  parsed.body.querySelectorAll("*").forEach((el) => {
    if (!el.hasAttribute("data-avab-id")) el.setAttribute("data-avab-id", `layer-${counter++}`);
    if (!el.hasAttribute("data-avab-name")) {
      const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 36);
      el.setAttribute("data-avab-name", text || el.tagName.toLowerCase());
    }
  });
  return "<!doctype html>\n" + parsed.documentElement.outerHTML;
}
