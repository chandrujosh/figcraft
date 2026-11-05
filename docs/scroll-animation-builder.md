# Native scroll animation builder

The Prototype panel now includes a per-layer **Scroll animations** editor. It uses FigCraft's
existing Rust document, command, collaboration and prototype-preview architecture; it does not
add an Electron shell or a separate browser runtime.

## Authoring

1. Select a layer and open the **Prototype** tab.
2. In **Scroll animations**, add an animation and enable it.
3. Choose a scroll trigger, set the overall start/end percentage and add one or more steps.
4. For each step, choose a property, from/to values, a normalized timeline interval and an easing.
5. Scroll the prototype preview to scrub the animation. Changes are applied to the preview copy;
   they do not mutate the saved design layer's geometry or appearance.

The editor supports enabled/disabled state, naming, reverse playback, duplicate/remove animation,
remove/add steps, and up to 32 animations with up to 32 steps each on one layer. Animation values
are sanitized when written to the document. The new `scrollAnimations` node property is saved with
the document and synchronized through the existing collaboration property mechanism.

## Scroll triggers

- **While scrolling in view**: scrub as the layer crosses the viewport.
- **While scrolling through section**: scrub against the nearest scrolling frame's full vertical
  scroll range (or horizontal range when vertical scrolling is unavailable).
- **Scroll into view**: scrub from the layer entering at the viewport bottom until its top reaches
  the viewport top.
- **Scroll out of view**: scrub as the layer leaves through the viewport's top edge.

The visual scroll-action timeline supports opacity, X/Y movement, scale, rotation, blur, vertical parallax, width and height. Each track has a selectable action target (the trigger layer or another layer on the same page), draggable start/end handles, From/To values and an easing preset. In Prototype > Scroll behavior, layers can be set to Relative/in-flow, Absolute/ignore auto layout, Fixed in a scroll frame, or Sticky in a scroll frame.
Each step has its own normalized start/end interval and easing curve. The supported easing presets
are the same easing values already used by FigCraft's prototype transition system.

## Scope of this implementation

This is the first native scroll-scrubbing implementation. It is not yet a complete Webflow-equivalent
time-based interaction system:

- Duration and delay are stored as part of the animation definition, but scroll-scrub playback is
  driven by the scroll position and does not consume those two values yet.
- Page-load, hover and click animation timelines are not part of this new editor. Existing prototype
  interactions for click/hover and page navigation remain available in the existing Interactions
  section.
- Animation-specific breakpoint overrides are not available yet. The animation is used by the
  existing responsive prototype preview at each preview size.
- A standalone web export/runtime for these animations is not added by this change.

These limitations are called out explicitly so the presence of the controls is not mistaken for
fully implemented time-based playback or website export.
