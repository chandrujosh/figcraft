# FigCraft Motion Studio

A browser-first visual website animation authoring app built as a standalone Vite/React application. The studio edits real DOM elements inside an isolated website preview, stores structured animation projects, and exports a static website ZIP with a GSAP/ScrollTrigger runtime.

## Run locally

Requirements: Node.js 22+.

```sh
cd apps/animation-studio
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build the standalone browser app

```sh
npm run build
```

The production output is a single-file `dist/index.html` using the Vite single-file plugin. It can be opened in a modern desktop browser. The browser app uses localStorage for autosave; export a Motion Project JSON to keep a separate backup.

## Workflow

1. Import an HTML file or a static website ZIP. For ZIPs, the importer looks for `index.html` (or the first HTML entry) and inlines local CSS, common images, SVGs and font assets when it can resolve them.
2. Select real DOM elements in the preview. Shift/Ctrl/Command-click to multi-select. The Structure panel supports rename, hide, lock, duplicate, group/ungroup and sibling drag reorder.
3. Create an animation sequence and configure its trigger.
4. Add transform, position, appearance, typography, layout or SVG property tracks.
5. Edit multiple keyframes, drag them on the timeline, use per-track start offsets, stagger and overlap.
6. Preview in the iframe using GSAP/ScrollTrigger. Use desktop, tablet and mobile widths to edit per-breakpoint overrides.
7. Export a project JSON or a website ZIP.

## Website export

The website ZIP contains:
- `index.html` — imported website with the animation runtime tag.
- `motion-project.json` — editable sequence, trigger, track and keyframe configuration.
- `motion-runtime.js` — runtime bootstrap for GSAP and ScrollTrigger.
- `README.md` — deployment notes.

The exported runtime loads GSAP 3.13.0 and ScrollTrigger from jsDelivr. An internet connection is needed unless those libraries are vendored locally by the site owner.

## Current implementation boundaries

- The preview is an iframe DOM editor; it is separate from FigCraft's native Rust/egui canvas.
- Imported page scripts are stripped from the editor preview for sandbox safety. The export preserves the HTML that passes sanitization and adds the generated animation runtime; source-site custom JavaScript bundles are not imported/executed by this studio.
- Static HTML/CSS websites are the supported import target. Server-rendered frameworks, routes requiring a backend, protected assets, dynamic CMS data and authenticated pages need a static export before import.
- Text reveal supports word and character splitting. It does not currently perform typography-aware line splitting.
- SVG stroke dash animation is supported as a property track. SVG path morphing/drawing authoring and external Lottie, Spline or Rive integrations are not included yet.
- Presets, timeline tracks and trigger controls are editable. The visual timeline is percentage/time based; it is not a full After Effects frame editor with nested compositions.
- Browser compatibility depends on modern CSS/DOM APIs and the browser's support for GSAP's transforms and CSSPlugin.

## CI build artifact

The repository workflow `.github/workflows/browser-animation-studio.yml` builds the single-file browser app and uploads `FigCraft-Motion-Studio-Web` as a GitHub Actions artifact on pushes to `feature/browser-animation-studio`.
