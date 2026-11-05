use super::scroll::{apply_scroll, clamp_scroll, fit_viewport, page_settings, raise_fixed, viewport};
use super::{Anim, Arc, Document, Easing, NodeId, Presenter, Scroller, Snapshot, Transition, Trigger, Value, Visit, json};
use figcraft_doc::proto::{AnimationProperty, Overflow, ScrollAnimationTrigger};
use figcraft_doc::{Blur, Effect, EffectKind};

impl Presenter {
    /// Close the top overlay; it animates out with its opening transition reversed.
    pub(super) fn close_overlay(&mut self, now: f64) -> bool {
        let Some(o) = self.overlays.pop() else { return false };
        if !matches!(o.transition, Transition::Instant) && o.dur > 0.0 {
            // An overlay closed mid-opening reverses from where it got to.
            let shown = ((now - o.opened) / o.dur).clamp(0.0, 1.0);
            self.closing.push((now - (1.0 - shown) * o.dur, o));
        }
        self.hovered.clear();
        true
    }

    /// Follow the editor's document: copy it the first time and whenever it changed, keeping the
    /// screen, the overlays and the scroll offsets that still exist (a deleted screen goes back to
    /// the start). Runtime state (variables set, variants changed) starts over from the edit.
    pub fn sync(&mut self, doc: &Arc<Document>, now: f64) {
        if self.source.as_ref().is_some_and(|s| Arc::ptr_eq(s, doc)) {
            return;
        }
        let first = self.source.is_none();
        self.source = Some(doc.clone());
        let copy = Document::clone(doc);
        self.original = Some(copy.clone());
        self.design = Some(copy);
        self.relayout();
        if first {
            self.arrived = now;
            return;
        }
        if !doc.contains(self.current) {
            if doc.contains(self.start) {
                self.restart(self.start, now);
            }
            return;
        }
        self.history.retain(|v| doc.contains(v.frame));
        self.overlays.retain(|o| doc.contains(o.id));
        self.closing.retain(|(_, o)| doc.contains(o.id));
        // These hold states of the document before the edit.
        self.temp = None;
        self.anim = None;
        self.scroll_anim = None;
        self.stop_scrolling();
        self.scroll.retain(|f, _| doc.contains(*f));
        if let Some(laid) = self.doc.as_ref() {
            let clamped: Vec<(NodeId, (f64, f64))> = self.scroll.iter().map(|(f, s)| (*f, clamp_scroll(*s, self.range(laid, *f)))).collect();
            self.scroll.extend(clamped);
        }
        self.rev += 1;
    }

    /// Lay the document out for the screen: `design` with the presented frame resized to `fit`
    /// when the prototype is responsive (its constraints and auto layout respond), instances
    /// playing their variants' interactions and fixed layers on top.
    pub(super) fn relayout(&mut self) {
        let mut d = self.design.clone();
        if let Some(d) = d.as_mut() {
            if let Some(size) = self.fit {
                figcraft_engine::cmd::proto::respond(d, self.current, size);
            }
            figcraft_engine::proto_run::play_interactions(d);
            raise_fixed(d);
        }
        self.uses_pads = d.as_ref().is_some_and(figcraft_doc::proto::uses_gamepad);
        self.doc = d;
        self.rev += 1;
    }

    /// After an action changed layers of `design` (since `before`): text resizes to what it shows,
    /// instances follow and auto layout reflows, as after an edit on the canvas; then
    /// [`relayout`](Self::relayout).
    pub(super) fn settle(&mut self, before: &Document) {
        if let Some(d) = self.design.as_mut() {
            figcraft_engine::normalize(d, before);
        }
        self.relayout();
    }

    /// Responsive prototypes: resize the presented frame to a screen of `size` (None: frames
    /// keep their size). Lays out again only when it changes.
    pub(super) fn respond_to(&mut self, size: Option<(f64, f64)>) {
        if self.fit != size {
            self.fit = size;
            self.relayout();
        }
    }

    /// The player's document with scroll offsets applied and the presented frame sized to the
    /// device's screen (cached per revision).
    pub(crate) fn display(&mut self) -> Option<Document> {
        if let Some((r, d)) = &self.display
            && *r == self.rev
        {
            return Some(d.clone());
        }
        let doc = self.doc.as_ref()?;
        let mut d = apply_scroll(doc, &self.scroll);
        if let Some(vp) = viewport(doc, self.current) {
            fit_viewport(&mut d, self.current, vp);
        }
        self.apply_scroll_animations(&mut d, doc);
        self.display = Some((self.rev, d.clone()));
        Some(d)
    }

    /// Apply the scroll timelines to the player's displayed copy. The saved design is never
    /// mutated; each repaint starts from the unanimated document and derives values from the
    /// nearest scrolling ancestor.
    fn apply_scroll_animations(&self, displayed: &mut Document, base: &Document) {
        for id in base.subtree(self.current) {
            let Some(source) = base.node(id) else { continue };
            if source.scroll_animations.is_empty() || id == self.current {
                continue;
            }
            let ancestors = base.ancestors(id);
            let frame = ancestors
                .iter()
                .copied()
                .find(|a| base.node(*a).is_some_and(|n| n.overflow != Overflow::None))
                .or_else(|| ancestors.contains(&self.current).then_some(self.current));
            let Some(frame) = frame else { continue };
            let Some(frame_bounds) = base.world_bounds(frame) else { continue };
            let Some(node_bounds) = base.world_bounds(id) else { continue };
            let Some(frame_node) = base.node(frame) else { continue };
            let range = if frame == self.current { self.range(base, frame) } else { super::scroll::scroll_range_in(base, frame, None) };
            let scroll = self.scroll.get(&frame).copied().unwrap_or((0.0, 0.0));
            let viewport_height = if frame == self.current {
                viewport(base, frame).map_or(frame_node.height, |v| v.1)
            } else {
                frame_node.height
            }
            .max(1.0);
            let relative_top = node_bounds.y0 - frame_bounds.y0 - scroll.1;
            let visible_height = (node_bounds.y1 - node_bounds.y0).max(1.0);
            let Some(target) = displayed.node_mut(id) else { continue };
            for animation in source.scroll_animations.iter().filter(|a| a.enabled) {
                let progress = scroll_animation_progress(animation, range, scroll, viewport_height, relative_top, visible_height);
                apply_scroll_animation(target, animation, progress);
            }
        }
    }

    /// The player's state for `ui.inspect`.
    pub fn inspect(&self) -> Value {
        let doc = self.doc.as_ref();
        let pan = self.offset(Scroller::View);
        json!({
            "current": self.current,
            "name": doc.and_then(|d| d.node(self.current)).map(|n| n.name.as_str()),
            "start": self.start,
            "history": self.history.iter().map(|v| v.frame).collect::<Vec<_>>(),
            "overlays": self.overlays.iter().map(|o| o.id).collect::<Vec<_>>(),
            "scroll": self.scroll.get(&self.current).map_or([0.0, 0.0], |s| [s.0, s.1]),
            "scrollRange": doc.map(|d| { let r = self.range(d, self.current); [r.0, r.1] }),
            "device": doc.and_then(|d| page_settings(d, self.current).device()).map(|d| d.name),
            "landscape": doc.is_some_and(|d| page_settings(d, self.current).landscape()),
            "viewport": doc.and_then(|d| viewport(d, self.current)).map(|v| [v.0, v.1]),
            "scale": self.view.scale.id(),
            "deviceFrame": self.view.device_frame,
            "comments": self.view.comments,
            "hotspotHints": self.view.hotspot_hints,
            "hotspots": self.hot.iter().map(|(id, r)| json!({"id": id, "rect": [r.min.x, r.min.y, r.max.x, r.max.y]})).collect::<Vec<_>>(),
            "hotspotFlash": self.flash_until > self.clock,
            "waiting": self.waiting.len(),
            "inspect": self.view.inspect,
            "inspected": self.inspected,
            "hideUi": self.view.hide_ui,
            "deviceColor": doc.and_then(|d| page_settings(d, self.current).device_color()).map(|c| c.name),
            "responsive": self.fit.map(|f| [f.0, f.1]),
            "frameSize": doc.and_then(|d| d.node(self.current)).map(|n| [n.width, n.height]),
            "pan": [pan.0, pan.1],
            "panRange": [self.pan_range.0, self.pan_range.1],
            "zoom": self.zoom,
            "flinging": self.fling.is_some(),
            "gamepad": self.uses_pads,
            "linkNotice": self.link_notice.as_ref().map(|(url, ..)| url),
        })
    }

    pub(super) fn snapshot(&self) -> Option<Snapshot> {
        Some(Snapshot {
            current: self.current,
            doc: self.design.clone()?,
            overlays: self.overlays.clone(),
            history: self.history.clone(),
            scroll: self.scroll.clone(),
        })
    }

    /// Start a transition from the state as it is now; call before changing the state.
    pub(super) fn begin(&mut self, transition: Transition, dur: f64, easing: Easing, now: f64) {
        let Some(from_doc) = self.display() else { return };
        let from_tex = self.textures.get(&self.current).cloned();
        self.anim = if matches!(transition, Transition::Instant) || dur <= 0.0 {
            None
        } else {
            Some(Anim { from_doc, from_frame: self.current, from_tex, transition, start: now, dur, easing, follow: None })
        };
    }

    fn arrive(&mut self, now: f64) {
        if let Some(doc) = self.doc.as_ref() {
            figcraft_engine::proto_run::remember_sections(doc, self.current, &mut self.sections);
        }
        self.arrived = now;
        self.delays_fired.clear();
        self.waiting.clear();
        self.hovered.clear();
        self.rev += 1;
    }

    /// Show `frame`. It starts scrolled to the top unless `preserve` keeps the scroll position of
    /// the frame being left (as far as `frame` can scroll).
    pub(super) fn go(&mut self, frame: NodeId, transition: Transition, dur: f64, easing: Easing, now: f64, remember: bool, preserve: bool) {
        self.begin(transition, dur, easing, now);
        if remember {
            self.history.push(Visit { frame: self.current, transition, dur, easing });
        }
        let kept = self.scroll.get(&self.current).copied().filter(|_| preserve);
        self.overlays.clear();
        self.scroll.clear();
        self.scroll_anim = None;
        self.stop_scrolling();
        self.pan = None;
        self.temp = None;
        self.current = frame;
        self.relayout();
        if let Some(s) = kept
            && let Some(doc) = self.doc.as_ref()
        {
            let to = clamp_scroll(s, self.range(doc, frame));
            self.scroll.insert(frame, to);
        }
        self.arrive(now);
    }

    /// Start over at `start` with the document as the editor has it.
    pub fn restart(&mut self, start: NodeId, now: f64) {
        self.start = start;
        self.current = start;
        self.sections.clear();
        self.history.clear();
        self.overlays.clear();
        self.scroll.clear();
        self.scroll_anim = None;
        self.stop_scrolling();
        self.pan = None;
        self.anim = None;
        self.temp = None;
        self.design = self.original.clone();
        self.relayout();
        self.arrive(now);
    }

    pub(super) fn revert(&mut self, now: f64) {
        let Some(t) = self.temp.take() else { return };
        self.begin(t.transition.reversed(), t.dur, t.easing, now);
        self.current = t.snap.current;
        self.design = Some(t.snap.doc);
        self.relayout();
        self.overlays = t.snap.overlays;
        self.history = t.snap.history;
        self.scroll = t.snap.scroll;
        self.stop_scrolling();
        self.hovered.clear();
        self.rev += 1;
    }
}

fn scroll_animation_progress(
    animation: &figcraft_doc::proto::ScrollAnimation,
    range: (f64, f64),
    scroll: (f64, f64),
    viewport_height: f64,
    relative_top: f64,
    visible_height: f64,
) -> f64 {
    let base_progress = match animation.trigger {
        ScrollAnimationTrigger::WhileScrollingInView => (viewport_height - relative_top) / (viewport_height + visible_height),
        ScrollAnimationTrigger::WhileScrolling => {
            if range.1 > 0.0 {
                scroll.1 / range.1
            } else if range.0 > 0.0 {
                scroll.0 / range.0
            } else {
                0.0
            }
        }
        ScrollAnimationTrigger::ScrollIntoView => (viewport_height - relative_top) / viewport_height,
        ScrollAnimationTrigger::ScrollOutOfView => -relative_top / visible_height,
    };
    let base_progress = if base_progress.is_finite() { base_progress.clamp(0.0, 1.0) } else { 0.0 };
    let progress = ((base_progress * 100.0 - animation.start) / (animation.end - animation.start).max(0.1)).clamp(0.0, 1.0);
    if animation.reverse { 1.0 - progress } else { progress }
}

fn apply_scroll_animation(target: &mut figcraft_doc::Node, animation: &figcraft_doc::proto::ScrollAnimation, progress: f64) {
    let (mut opacity, mut translate_x, mut translate_y, mut scale, mut rotate, mut blur) = (None, 0.0, 0.0, 1.0, 0.0, None);
    for step in &animation.steps {
        if progress < step.start {
            continue;
        }
        let length = (step.end - step.start).max(0.001);
        let local = ((progress - step.start) / length).clamp(0.0, 1.0);
        let eased = step.easing.eval(local);
        let value = step.from + (step.to - step.from) * eased;
        match step.property {
            AnimationProperty::Opacity => opacity = Some(value.clamp(0.0, 1.0) as f32),
            AnimationProperty::TranslateX => translate_x += value,
            AnimationProperty::TranslateY | AnimationProperty::ParallaxY => translate_y += value,
            AnimationProperty::Scale => scale = value.clamp(0.0, 100.0),
            AnimationProperty::Rotate => rotate += value,
            AnimationProperty::Blur => blur = Some(value.clamp(0.0, figcraft_doc::MAX_BLUR_RADIUS)),
        }
    }
    if let Some(value) = opacity {
        target.opacity = value;
    }
    apply_scroll_transform(target, translate_x, translate_y, scale, rotate);
    if let Some(radius) = blur {
        apply_scroll_blur(target, radius);
    }
}

fn apply_scroll_transform(target: &mut figcraft_doc::Node, translate_x: f64, translate_y: f64, scale: f64, rotate: f64) {
    if translate_x == 0.0 && translate_y == 0.0 && (scale - 1.0).abs() <= 1e-9 && rotate == 0.0 {
        return;
    }
    let cx = target.width / 2.0;
    let cy = target.height / 2.0;
    let local = figcraft_geom::Affine::translate((cx, cy))
        * figcraft_geom::Affine::rotate(-rotate.to_radians())
        * figcraft_geom::Affine::scale_non_uniform(scale, scale)
        * figcraft_geom::Affine::translate((-cx, -cy));
    target.transform = figcraft_geom::Affine::translate((translate_x, translate_y)) * target.transform * local;
}

fn apply_scroll_blur(target: &mut figcraft_doc::Node, radius: f64) {
    for effect in &mut target.effects {
        if let EffectKind::LayerBlur(existing) = &mut effect.kind {
            *existing = Blur::uniform(radius);
            return;
        }
    }
    if radius > 0.0 {
        let mut effect = Effect::layer_blur();
        if let EffectKind::LayerBlur(existing) = &mut effect.kind {
            *existing = Blur::uniform(radius);
        }
        target.effects.push(effect);
    }
}

/// The soonest "after delay" interaction in `root`'s subtree that hasn't fired yet, and the seconds
/// until it's due (zero or less: due now). Timers start when the screen arrives, an overlay's when
/// it opens.
pub(crate) fn next_delay(p: &Presenter, doc: &Document, root: NodeId, now: f64) -> Option<((NodeId, usize), f64)> {
    let since = p.overlays.last().filter(|o| o.id == root).map_or(p.arrived, |o| o.opened);
    let mut next: Option<((NodeId, usize), f64)> = None;
    for id in doc.subtree(root) {
        let Some(n) = doc.node(id) else { continue };
        for (k, it) in n.interactions.iter().enumerate() {
            if let Trigger::AfterDelay { ms } = it.trigger
                && !p.delays_fired.contains(&(id, k))
            {
                let due = since + f64::from(ms) / 1000.0 - now;
                if next.is_none_or(|(_, d)| due < d) {
                    next = Some(((id, k), due));
                }
            }
        }
    }
    next
}
