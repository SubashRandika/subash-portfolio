# THE CAREER FLIGHT — Architecture

Decisions made in Phase 01. Later phases update this file when a decision changes.

## 1. Guiding principles

1. **The page is a document first.** Every career fact is server-rendered semantic HTML built from typed data. The 3D flight is a progressive enhancement layered on top; the site is complete without WebGL, without JavaScript-driven motion, and for crawlers.
2. **Everything in the flight is a pure function of one number.** A normalized `progress` (0–1) derived from scroll decides aircraft pose, camera, lighting, environment visibility, HUD and card state. No simulation state accumulates, so scrolling backward is exactly the reverse of scrolling forward.
3. **No per-frame React work.** Per-frame values live in a mutable store and are applied imperatively (Three.js objects, GSAP, DOM refs). React state changes only on coarse events such as "active chapter changed".
4. **Facts are never invented.** Unknown values are `null` in the data layer and the UI omits them.

## 2. Rendering model

| Concern | Decision |
| --- | --- |
| Routing | One statically prerendered route (`/`) in the Next.js App Router. |
| Components | Server Components by default. Client Components only for the flight island, HUD, navigation toggles and disclosure widgets. |
| 3D loading | `next/dynamic` with `ssr: false` inside a client wrapper. The chunk is requested after first paint and only when a capability check passes. |
| Fallback | `data-flight="static"` (default, also used for no-WebGL, reduced motion and low-end devices) renders chapters as a static illustrated timeline. `data-flight="live"` is set by the client once the 3D experience is ready. |

## 3. Scroll model

```
<section id="flight">                     tall, in normal document flow
  <div class="stage sticky top-0">        100svh: <canvas>, HUD
  <div class="narrative">                 overlays the stage, scrolls natively
    <header id="takeoff">                 0–8 %
    <article id="chapter-01">             8–22 %
    <article id="chapter-02">             22–38 %
    <article id="chapter-03">             38–51 %
    <article id="chapter-04">             51–65 %
    <article id="chapter-05">             65–84 %
    <article id="chapter-06">             84–100 % + closing message
```

- Chapter heights are proportional to their share of the timeline, so **scroll position itself encodes the chapter**. Direct chapter navigation is a plain anchor link (`#chapter-03`) that works without JavaScript and for keyboard and screen-reader users.
- A single GSAP timeline with ScrollTrigger (`scrub`) maps the section's scroll range to `progress`. The timeline carries chapter labels; DOM choreography (chapter intros, milestone cards) hangs off the same timeline.
- Native scrolling is never hijacked. "Begin flight" and "Skip intro" are ordinary scroll-to actions.

## 4. Flight system (framework-free core)

`src/flight/` holds pure TypeScript with no React or DOM dependencies, unit-tested in Vitest:

| Module | Responsibility |
| --- | --- |
| `timeline.ts` | Chapter ranges, progress ↔ chapter mapping. |
| `path.ts` | Route geometry: position, heading, climb angle, bank from curvature. |
| `shots.ts` | Camera shot keyframes (establishing, chase, side, aerial, top-down, close-up) and interpolation. |
| `atmosphere.ts` | Sun direction, sky colors, fog and exposure keyframes. |
| `store.ts` | Mutable progress store plus coarse subscriptions. |

React Three Fiber components (`src/components/flight`, `src/components/environments`) read these each frame inside `useFrame`.

## 5. 3D world

- **One continuous world.** The six environments are regions of a single route so transitions are geographic, not cuts.
- **Terrain.** A camera-following clipmap grid displaced on the GPU by a height function whose parameters (relief, roughness, vegetation, water) vary along the route. Flat analytic zones host the airport, the industrial region and the city.
- **Environment sets.** `Airport`, `Mountains`, `IndustrialRegion`, `GeoTerrain`, `City`, `Clouds` are mounted by progress window — the current region and its immediate neighbours only — and dispose their GPU resources on unmount.
- **Aircraft.** Modelled procedurally by `scripts/build-aircraft.mjs` and exported as a Meshopt-compressed GLB with separately named nodes (landing gear, gear doors, engine fans, navigation lights) for independent animation. See risk R1.
- **Lighting.** Analytic sky and sun keyframed by progress, exponential height fog for aerial perspective, sky-derived environment reflections, ACES tone mapping. No full-screen post-processing by default; glows are additive sprites and the vignette is CSS.

## 6. Graphics profiles

`useDeviceCapabilities` measures instead of sniffing user agents: WebGL2 support, `MAX_TEXTURE_SIZE`, unmasked renderer class, device memory, pointer type and a short frame-time probe; a runtime monitor lowers the tier if frame time degrades.

| Profile | Pixel ratio cap | Terrain | Props | Extras |
| --- | --- | --- | --- | --- |
| HIGH | 2.0 | full clipmap, per-pixel normals | full instancing | soft aircraft shadow, env reflections updated live |
| MEDIUM | 1.5 | reduced levels | reduced density | static env reflections |
| LOW | 1.0 | coarse, vertex normals | sparse | no shadow, shorter camera moves |

## 7. Directory layout

```
src/
  app/              layout, page, sitemap, robots, manifest, icons, OG image
  components/
    ui/             base accessible components
    layout/         header, footer, skip link
    flight/         FlightExperience, FlightScene, Aircraft, FlightCamera, FlightController, terrain, sky
    environments/   Airport, Mountains, IndustrialRegion, GeoTerrain, City, Clouds
    storytelling/   ChapterSection, MilestoneCard, FlightHUD, ChapterNavigation, Opening
    portfolio/      About, Skills, Projects, Experience, Education, Contact
  data/             profile, chapters, experience, projects, skills (typed, verified facts only)
  flight/           pure flight math (see section 4)
  hooks/            useFlightProgress, useReducedMotion, useDeviceCapabilities
  lib/              site config, SEO helpers, utilities
  types/            shared portfolio types
scripts/            asset generation and deployment checks
public/             models, images, icons, résumé
e2e/                Playwright specs
docs/               architecture and deployment documentation
```

This differs from the suggested layout in two ways: sources live under `src/`, and flight math is separated from React components (`src/flight`) so it can be tested without a renderer.

## 8. Dependencies

| Package | Purpose |
| --- | --- |
| `next`, `react`, `react-dom` | Framework, App Router, static prerendering. |
| `tailwindcss`, `@tailwindcss/turbopack` | Styling via design tokens declared in CSS. |
| `three`, `@react-three/fiber`, `@react-three/drei` | 3D rendering, React binding, loaders and helpers. |
| `gsap` (with ScrollTrigger) | Master scroll timeline and scrubbed DOM choreography. |
| `motion` | Framer Motion's current package; discrete UI transitions only (menus, disclosures). |
| `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/*` | Unit and component tests. |
| `@playwright/test` | End-to-end tests against the production build. |
| `eslint`, `eslint-config-next`, `typescript` | Static analysis. |

Deliberately not added: a global state library, a UI kit, an icon font, a post-processing stack, a Draco decoder (Meshopt needs no external decoder files).

## 9. Performance strategy

- LCP is server-rendered text in the opening; the 3D chunk loads after first paint and never blocks it.
- A static poster stands in until the first 3D frame is ready, then cross-fades.
- Only the aircraft and the first region load up front; later regions mount as the visitor approaches them.
- Geometry and materials are shared and instanced; all GPU resources are disposed on unmount.
- Measured budgets: Lighthouse Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95, LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Results are recorded in `PROJECT_PROGRESS.md`; shortfalls are reported, not hidden.

## 10. SEO and accessibility strategy

- Metadata, canonical, Open Graph, X cards, sitemap, robots and JSON-LD (`Person`, `WebSite`, `ProfilePage`) are generated from the same typed data as the page.
- `NEXT_PUBLIC_SITE_URL` is the only source of the production origin. Without a valid value the build marks itself non-indexable and omits canonicals; a deploy check fails hard.
- WCAG 2.2 AA: one `h1`, ordered headings, landmarks, skip link, visible focus, 4.5:1 text contrast, no hover-only interaction, no autoplay audio, `prefers-reduced-motion` honoured, canvas hidden from assistive technology with an equivalent text narrative.

## 11. Required assets

| Asset | Source | Status |
| --- | --- | --- |
| Executive jet GLB | Generated in-repo by script | Phase 03 |
| Terrain, sky, water, clouds | Procedural shaders | Phases 03–05 |
| Airport, industrial, city props | Procedural instanced geometry | Phase 05 |
| Fonts | Open-licensed families via `next/font` (self-hosted at build) | Phase 02 |
| Icons | Inline SVG drawn for this project | Phase 02 |
| Poster and social images | Rendered from the scene | Phases 08–09 |
| Résumé PDF | **Needed from Subash** | Outstanding |

## 12. Technical risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R1 | "Unreal-cinematic" photorealism is not achievable in a browser with procedural assets, and Blender is not installed. | Aim for cinematic realism through lighting, atmosphere and composition. The aircraft loader accepts any GLB that follows the node naming convention, so a licensed production model can replace the generated one later. |
| R2 | A WebGL scene competes with Lighthouse Performance ≥ 90, especially on mobile. | 3D loads after LCP, LOW profile and static fallback on weak devices, measured in Phase 08. |
| R3 | Windows Application Control blocks Playwright's downloaded Chromium on the development machine. | Tests use the installed, signed Chrome (`channel: "chrome"`); CI uses the bundled browser. The policy itself is untouched. |
| R4 | Long scroll experiences can disorient or exclude some visitors. | Native scrolling, anchor navigation, skip links, static mode, reduced-motion support. |
| R5 | Mobile GPUs: memory limits and context loss. | Tiered quality, capped pixel ratio, context-loss handler that falls back to static mode. |
| R6 | Missing professional facts (contact links, education, résumé). | Fields stay `null` and unrendered until supplied; tracked in `PROJECT_PROGRESS.md`. |
| R7 | Dev-only `npm audit` advisories in the ESLint toolchain. | Not shipped to visitors; re-checked in Phase 10. |
