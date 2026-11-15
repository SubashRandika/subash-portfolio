# Project Progress — THE CAREER FLIGHT

Living record of the build. The repository is the source of truth for implementation status; this file explains it.

## Project overview

A cinematic, scroll-driven 3D portfolio for Subash Rodrigo. An executive jet (SR-01) flies through six geographic environments, one per career chapter, while HTML milestone cards tell the professional story. Conventional portfolio sections carry the same information without 3D. Full brief: [CLAUDE.md](CLAUDE.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Approved requirements

Taken from the brief and treated as fixed unless Subash changes them:

- Stack: Next.js App Router, React, strict TypeScript, Tailwind CSS, Three.js with React Three Fiber and Drei, GSAP with ScrollTrigger, Framer Motion for UI transitions only, Vitest, React Testing Library, Playwright, ESLint.
- Six chapters on the timeline 0–8 % opening, 8–22 %, 22–38 %, 38–51 %, 51–65 %, 65–84 %, 84–100 %.
- Deterministic, reversible, scroll-driven flight; no React state updates per frame.
- All career information available as semantic HTML; WCAG 2.2 AA; reduced-motion and no-WebGL fallbacks.
- Adaptive HIGH / MEDIUM / LOW graphics; never load all six environments at once.
- `NEXT_PUBLIC_SITE_URL` instead of a hardcoded domain.
- No invented facts, dates, metrics, URLs or credentials.

## Status

| Phase | Name | Status |
| --- | --- | --- |
| 01 | Project inspection and architecture planning | Complete |
| 02 | Design system and responsive foundation | Complete |
| 03 | Aircraft and flight prototype | Complete |
| 04 | Master scroll timeline | Complete |
| 05 | Six realistic geographical environments | Complete |
| 06 | Career storytelling and milestone integration | Complete |
| 07 | Complete portfolio sections | In progress |
| 08 | Performance and accessibility optimization | Not started |
| 09 | SEO and deployment readiness | Not started |
| 10 | Final QA and release | Not started |

**Current phase:** 07 — Complete portfolio sections.

## Architecture and technical decisions

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Headline decisions:

1. Single static route; 3D is a lazily loaded client island over server-rendered HTML.
2. Chapters are in-flow `<article>` elements sized to their timeline share, with a sticky canvas stage behind them; chapter navigation is plain anchor links.
3. Flight math lives in framework-free modules under `src/flight` and is unit-tested.
4. One continuous procedural world; environment sets mount by progress window.
5. The aircraft is generated in-repo as a Meshopt-compressed GLB because no modelling tool or licensed model is available.
6. Sources live under `src/`.
7. Playwright drives installed Chrome locally (see known issues).
8. Visual identity: Michroma for titles, B612 and B612 Mono (the Airbus cockpit typefaces) for text and data; three themes that follow the sky through the day (night for the flight, day for the portfolio documents, dusk for contact).
9. Work experience is a logbook table with separate Employer and Client / product columns, so the two can never be confused.
11. Live or static is decided before first paint by an inline head script that sets `<html data-flight>`; CSS lays the page out from that attribute, so there is no layout shift on hydration. `?flight=static` and `?flight=live` override it for testing.
12. In live mode each chapter is one viewport taller than its share of the flight and overlaps the previous one, so its sticky panel is pinned for exactly its progress range and its top stays at its true scroll position.
13. Per-frame values live in `src/flight/frame.ts` (a plain mutable object). The flight controller fills it first each frame; sky, lights, runway and aircraft read from it.
14. Scene-graph objects that are mutated every frame are held in refs and changed inside module-level functions. This keeps the React Compiler lint rules (`react-hooks/immutability`) enabled without exceptions.
15. Custom surface shaders share one lighting and fog model (`shaders/lighting.glsl.ts`) that mirrors Three.js standard materials, so the ground and the aircraft agree about the light.
16. One GSAP timeline of duration 1, scrubbed by ScrollTrigger, is the only scroll clock (`src/components/flight/director.ts`). Its playhead is flight progress; the 3D scene, chapter text, milestones and HUD all read from it, and every tween is an explicit `fromTo`, so scrubbing backward replays the same states.
17. Navigation within the flight glides when the target is close (Begin flight plays the takeoff) and cuts through a short veil when it is far, so a jump never streaks through several environments or forces them all to load.
19. Terrain heights and land use are one TypeScript module mirrored in GLSL, on an integer hash that gives identical noise on CPU and GPU. Geometry, shading, object placement, camera clearance and the tests all agree because they evaluate the same functions.
20. Terrain is a quadtree of world-fixed tiles built on the CPU within a per-frame budget (never sliding with the camera, so it never swims); land use is shaded per pixel rather than modelled.
21. Structures are instanced primitives with one procedural facade shader, placed by the same land-use rules the terrain draws, and mounted only around their chapter.
22. The business district sits about 3 km beside the route: from cruising altitude a near-horizontal shot frames ground 2 km and further away, so that is where a skyline reads.
23. Portrait frames pull close shots back and widen them, so a phone always sees the whole aircraft.
18. Where the full milestone list does not fit (narrow or short viewports) the milestones share one slot and only the current one shows; portrait frames put the aircraft in the top of the frame and the text beneath it.
10. Milestone summaries are optional: when the brief says nothing beyond a milestone's title, the card shows the title alone rather than padded copy.

## Phase summaries

### Phase 01 — Project inspection and architecture planning (complete)

**Found:** the repository contained only `CLAUDE.md`; no application, no Git repository. Environment: Windows 11, Node 22.23, npm 10.9, Git 2.52, Python 3.14, Chrome and Edge installed, Blender not installed.

**Implemented:**

- Next.js 16.4 foundation (App Router, React 19.3, TypeScript 5.9 strict, Tailwind CSS 4.3, ESLint 9, Turbopack).
- Runtime dependencies for later phases: `three`, `@react-three/fiber`, `@react-three/drei`, `gsap`, `motion`.
- Test tooling: Vitest 5 with jsdom and React Testing Library; Playwright with desktop, tablet and mobile projects against the production build.
- Site origin resolver (`src/lib/site.ts`) driven by `NEXT_PUBLIC_SITE_URL`, with unit tests.
- Minimal placeholder home page (the template page and images were removed).
- Architecture document, README, `.env.example`, npm scripts (`typecheck`, `test`, `test:e2e`, `verify`).

**Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`, `vitest.setup.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/site.ts`, `src/lib/site.test.ts`, `e2e/smoke.spec.ts`, `docs/ARCHITECTURE.md`, `README.md`, `AGENTS.md` (generated by Next.js).

**Verification (2026-11-15):**

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, no findings |
| `npm run typecheck` | Pass |
| `npm run test` | Pass, 6 of 6 |
| `npm run build` | Pass; `/` statically prerendered |
| `npm run test:e2e` | Pass, 3 of 3 (desktop, tablet, mobile) |

### Phase 02 — Design system and responsive foundation (complete)

**Implemented:**

- Design tokens in `src/app/globals.css`: raw palette, semantic per-theme tokens (`night`, `day`, `dusk`), fluid type scale, spacing, focus, selection and reduced-motion rules.
- Typography through `next/font` (self-hosted at build): Michroma, B612, B612 Mono.
- Base components: `Button` / `ButtonLink` (primary, secondary, quiet), `Icon`, `DocSection`, tags, skip link.
- Layout: fixed `SiteHeader` with inline navigation on wide screens and a disclosure menu on narrow ones (Escape closes and restores focus), `SiteFooter`.
- Flight storytelling markup: `FlightSection`, `Opening`, `ChapterSection`, `MilestoneCard` (flight-strip style), `ChapterNavigation`, `FlightHUD` (progress rail with proportionally placed chapter links, readout strip).
- Static mode of the flight, which is also the no-WebGL fallback; the CSS for live mode (sticky stage, chapter heights proportional to the timeline) is in place and activates with `data-flight="live"`.
- Portfolio sections with real content: About, Technical expertise, Selected projects, Work experience (logbook), Education (renders only when data exists), Contact.
- Typed content layer: `src/types/portfolio.ts`, `src/data/*`, `src/flight/timeline.ts`.
- Internal design reference at `/styleguide` (noindex).

**Files:** `src/app/{globals.css,layout.tsx,page.tsx,styleguide/page.tsx}`, `src/components/{ui,layout,storytelling,portfolio}/*`, `src/data/*`, `src/flight/timeline.ts`, `src/lib/{utils,navigation}.ts`, `src/types/portfolio.ts`, tests alongside.

**Verification (2026-11-15):**

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass, 40 of 40 in 5 files |
| `npm run test:e2e` | Pass, 24 of 24 (8 tests × desktop, tablet, mobile) |
| Visual review | Opening, chapters, HUD, portfolio sections and mobile menu checked at 1440 × 900 and 390 × 844; no horizontal overflow |

**Limitations:** the painted CSS skies are stand-ins until poster frames can be rendered from the 3D scene (Phase 08). Milestone copy is deliberately terse because it restates the brief without embellishment.

### Phase 03 — Aircraft and flight prototype (complete)

**Implemented:**

- **Aircraft model.** `scripts/build-aircraft.mjs` (`npm run build:aircraft`) generates `public/models/sr-01.glb`: lofted fuselage with a two-tone pearl and graphite paint line, swept wings with blended winglets, T-tail, twin rear turbofans with fans and pylons, wraparound cockpit visor, cabin windows, landing gear, navigation, beacon and landing lights. 22,520 triangles, 160 KB with Meshopt compression and quantization. Fans, the three gear legs and the light groups are separate nodes; empty anchor nodes mark glow and marking positions.
- **Aircraft runtime** (`src/components/flight/Aircraft.tsx`): gear retraction about the hinges, spinning fans, flashing beacons, light glows whose strength follows ambient light, and the SR-01 marking drawn at runtime in the title typeface.
- **Flight core** (`src/flight`, no React): `path.ts` (route distance, meander, altitude profile, heading, climb angle, bank from turn curvature, takeoff rotation), `shots.ts` (camera choreography with a route-aligned frame and a screen-space framing offset that moves the aircraft aside for text), `atmosphere.ts` (nine art-directed looks from pre-dawn to the final sunrise), `store.ts`, `frame.ts`, `math.ts`.
- **Scene:** sky dome with sun, horizon glow and stars; sky-derived reflections captured to a cube map only when the light changes; sun, hemisphere light and fog; a basic airport (ground, runway with full markings, wet-look sheen, landing-light pool, 390-odd runway lights); a contact shadow from a distance-field silhouette.
- **Cameras:** establishing, approach, rear chase, rotation, liftoff, side tracking, climb-out.
- **Page integration:** `FlightStage` loads the WebGL chunk on demand, pauses rendering when the stage is off screen, cross-fades from the painted poster once frames are drawn, and falls back to the static page on a render error or lost context.
- Internal inspection page at `/lab/aircraft` (noindex).

**Bugs found and fixed during the phase:**

- Bank angle jumped about 8° where the route's meander fades in (second-derivative discontinuity). Caught by the continuity unit test; fixed with a C2 envelope.
- Heading wrapped between +π and −π when flying due "north". Caught by the same test.
- **The page scrolled by itself in live mode.** Browser scroll anchoring fought the sticky, overlapping chapter panels. Fixed with `overflow-anchor: none` on the flight section and covered by an end-to-end regression test.

**Verification (2026-11-15):**

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass, 66 of 66 in 7 files |
| `npm run test:e2e` | Pass, 48 of 48 (static, reduced motion and live suites × desktop, tablet, mobile) |
| `npm run build` | Pass; all routes static |
| Visual review | Aircraft from seven angles; opening, rear chase, liftoff and side tracking in the live page on a real GPU (AMD Radeon 860M) |

**Limitations carried forward:**

- Chapter text is not yet choreographed: panels overlap during transitions and the HUD shows its initial values. Both belong to Phase 04. *(Resolved in Phase 04.)*
- The ground is a flat placeholder. Terrain, coastline and airport buildings arrive in Phase 05.
- Landing gear folds into the airframe without gear doors.
- The aircraft is a procedural model: convincing at chase-camera distance, not a hero-shot asset.

### Phase 04 — Master scroll timeline (complete)

**Implemented:**

- **Flight director** (`src/components/flight/director.ts`, loaded on demand in live mode only): a GSAP master timeline scrubbed by ScrollTrigger across the flight section (scrub 0.7 s, 0.35 s on touch). It drives flight progress for the scene, the opening's exit, each chapter's intro and exit, the closing message, and the current-milestone highlight.
- **Chapter beats** (`src/flight/waypoints.ts`): pure functions placing each chapter's intro, milestones, exit and closing within its range; the same numbers place the HUD waypoint ticks, so cards and ticks always agree. Unit-tested.
- **Camera choreography for all six chapters** (`src/flight/shots.ts`): rear chase, side tracking, high aerial, top-down (chapter 4, aligned to the route heading), cinematic close-up and wide establishing shots, blended by progress.
- **Live HUD:** progress rail fill, percentage, chapter number, title and destination, passed-chapter state, and milestone waypoint ticks (wide screens with a fine pointer). Updated from the GSAP ticker by writing DOM text and CSS variables directly; React does not re-render while scrolling.
- **Navigation:** HUD chapter links, milestone waypoints and Begin flight are intercepted only inside the flight. Close targets glide; far targets cut through a 260 ms veil and finish the scrub at once. Any wheel, touch or scroll key cancels a glide. The URL hash is updated with `replaceState`.
- **Opening entrance:** the tagline paints first and is never hidden; the follow line, identity and "Scroll to fly at your own pace" hint rise in after it.
- **Layout fixes found in review:** milestone point lists leaked into the compact live cards (a Tailwind utility outranked the component rule); chapter 5 overflowed short and narrow viewports; the text scrim dimmed the HUD; the jet sat behind the text in portrait. All fixed.
- Milestone element ids now start with a letter (`milestone-1-career-start`) so they are valid CSS selectors; found by the existing link-target test.

**Files:** `src/components/flight/{director.ts,FlightStage.tsx,FlightController.tsx}`, `src/flight/{waypoints.ts,shots.ts,flight.test.ts}`, `src/components/storytelling/{FlightHUD,FlightSection,ChapterSection,MilestoneCard,Opening}.tsx`, `src/app/globals.css`, `e2e/flight.spec.ts`.

**Verification (2026-11-16):**

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass, 72 of 72 in 7 files |
| `npm run test:e2e` | Pass, 60 of 60 (desktop, tablet, mobile). New live tests: HUD and chapter text forward and backward with skipped chapters, one lit milestone that reverses cleanly, Begin flight glide, HUD chapter jump |
| `npm run build` | Pass (run by the end-to-end suite); all routes static |
| Visual review | Headless Chrome at 1440 × 900, 1366 × 768 and 390 × 844 across the whole flight |

**Limitations carried forward:**

- Milestone cards are titles only in the flight; their detail lives in the Experience section. Opening a card for its detail belongs to Phase 06.
- The world is still the Phase 03 airport and flat ground beyond it; the six environments are Phase 05.

### Phase 05 — Six realistic geographical environments (complete)

**Implemented:**

- **Six regions along one route** (`src/flight/terrain.ts`), blended over 2.6 km at each chapter boundary:
  1. Tropical coast: sea to the west with turquoise shallows, beach and surf, coastal road, gentle countryside, and the flattened airfield with taxiway, apron, terminal, control tower and hangars.
  2. Mountain valley: a meandering river and valley road between forested ridges rising to about 1.5 km, with rock on steep ground.
  3. Industrial plain: works with production halls, chimneys with aviation markings and tank farms, logistics yards with container stacks, warehouse estates, a canal, a railway and a trunk road, among farmland.
  4. Ridged uplands for the top-down map view: a main river beneath the route, tributaries, contour roads, woods, fields and villages.
  5. River city: street grid with avenues, parks, suburbs, bridges, mid-rise blocks and a business district of towers up to about 290 m.
  6. Highlands under a two-layer cloud deck with snow-capped mountains on the horizon. The aircraft climbs through the deck (the haze closes in, sky included) and breaks out on top into the sunrise.
- **Terrain renderer** (`Terrain.tsx`, `terrainTile.ts`): world-fixed quadtree tiles from 256 m to 131 km, a 4 ms per-frame build budget with coarse fallback, LRU release, and skirts.
- **Terrain shading:** farmland with staggered, drifting field patterns and hedgerows; villages; individually lit forest crowns; rock and snow by slope and height; water with ripples, sky reflection, sun glint and surf; multi-scale detail that fades by pixel size.
- **Structures** (`structures.ts`, `Structures.tsx`): 5,757 city and 935 industrial structures plus the airport, placed by the land-use rules (never in water, streets or parks) and drawn as two instanced meshes per set with one facade shader (curtain walls, punched windows, cladding with doors, tanks, container colours, bridge decks, chimney markings).
- **Clouds** (`clouds.ts`, `Clouds.tsx`): world-anchored layers with domain-warped shapes and gradient lighting; scattered over the city, a full deck in the last chapter.
- **Loading:** structures mount only from the chapter before theirs to the chapter after (`Environments.tsx`); the terrain streams continuously.
- Fog now uses the sky's horizon-band model, so distant terrain melts into the dawn sky instead of standing out against it.
- The camera keeps clear of the real terrain (sampled under the camera every frame), and portrait frames pull close shots back.

**Files:** `src/flight/{terrain,terrainTile,structures,clouds}.ts` and tests, `src/flight/{path,shots,atmosphere}.ts`, `src/components/environments/{Terrain,Structures,Clouds,Environments,Airport}.tsx`, `src/components/flight/{FlightScene,FlightController,Sky}.tsx`, `src/components/flight/shaders/lighting.glsl.ts`, `docs/ARCHITECTURE.md`.

**Verification (2026-11-16):**

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass, 88 of 88 in 9 files. New: region weights and layout, airfield flatness, continuity across boundaries, water where the shading draws it, valley walls, aircraft clearance (over 150 m) and camera clearance (over 40 m, landscape and portrait) for the whole flight, structure determinism, nothing in water, sizes, aircraft and camera clear of every structure |
| `npm run test:e2e` | Pass, 60 of 60 (production build) |
| Frame pacing | Headless Chrome on the AMD Radeon 860M at 1440 × 900, scrolling the whole flight in 30 s: median 16.7 ms, p95 17.4 ms, p99 32.9 ms, one hitch of about 290 ms |
| Visual review | Every chapter at 1440 × 900 and 390 × 844 |

**Limitations carried forward:**

- One main-thread hitch of about 290 ms when a district's structures are generated, and the base terrain tiles are built on the main thread at start. Phase 08 moves tile and structure generation off the main thread (or into idle time) and adds HIGH, MEDIUM and LOW profiles.
- Buildings are boxes and cylinders without setbacks or rooftop detail: convincing from flight altitude, plain up close.
- No individual tree geometry: forests are shaded canopies, which read well from altitude.

### Phase 06 — Career storytelling and milestone integration (complete)

**Implemented:**

- **Fact re-check against the brief.** Three attribution problems were found and corrected:
  - The work-experience entry for Creative Software (2022–present) described "technical leadership, architectural decisions and mentoring across an international development team" for the whole period. The brief gives those as Biosero responsibilities, and "technical leadership and mentoring" separately for IFS. Both are now attributed.
  - The Green Button Go Scheduler project listed leadership and mentoring as its contributions; the brief does not tie them to that product. It now lists only the product facts.
  - "IFS Cloud Home widgets in Angular and React" implied the widgets were built in both; the brief lists widgets, micro-frontend architecture and Angular and React development separately. Now listed separately in the chapter, project and experience entries.
- **Milestone cards open during the flight.** Each strip with detail has a disclosure button (`aria-expanded`, `aria-controls`); the detail is always in the HTML and the static page shows it. Summaries that only repeated a strip's own points were removed.
- **Focus areas per chapter**, restating the brief and labelled "Focus" (not "technologies") so they imply no stack.
- **Career timeline** at the top of Work experience: one row per employment on a shared time axis, dates as `<time>` elements, the current role fading out toward "Present" (the page is built ahead of time and cannot know today's date), and links from each role to its flight chapters.
- **Fixed during review:** where milestones share one slot (short or narrow screens), the invisible strips stacked on top took clicks and focus away from the current one. The timeline now marks the current strip (`data-current`, undone when scrubbing back), and only it takes pointer and keyboard input. Found by the new end-to-end test.
- The chapter header width limit in live mode was being overridden by a Tailwind utility; it is now a component class, so the text stays on the darkened side of the frame.

**Files:** `src/data/{chapters,experience,projects}.ts`, `src/types/portfolio.ts`, `src/components/storytelling/{MilestoneCard,ChapterSection}.tsx`, `src/components/portfolio/{CareerTimeline,Experience}.tsx`, `src/components/ui/Icon.tsx`, `src/components/flight/director.ts`, `src/app/globals.css`, `src/components/components.test.tsx`, `e2e/flight.spec.ts`.

**Verification (2026-11-16):**

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass, 92 of 92 in 9 files (new: disclosure markup, timeline layout and links, focus areas) |
| `npm run test:e2e` | Pass, 63 of 63 (new: opening a milestone during the flight, on desktop, tablet and mobile) |
| Visual review | Opened milestone at 1440 × 900 and 390 × 844; career timeline at both sizes |

## Known issues

- **Playwright's bundled Chromium cannot run on this machine.** Windows reports "An Application Control policy has blocked this file" for the unsigned `chrome-headless-shell.exe`. The policy was left untouched. Tests use the installed, signed Google Chrome through `channel: "chrome"`; the blocked download was removed with `npx playwright uninstall`.
- **`npm audit` reports 8 moderate advisories**, all inside the ESLint toolchain pulled in by `eslint-config-next`. They are development-only and are not shipped. To be re-checked in Phase 10.
- **Blender is not installed**, so asset preparation is done in code.
- **The dev server's file watcher sometimes misses stylesheet writes** on this machine (seen with Turbopack on Windows). Re-saving `src/app/globals.css` triggers the rebuild. Production builds are unaffected.
- **Browser automation only renders frames when a screenshot forces one**, because the automation window is occluded and `requestAnimationFrame` is throttled. Visual checks therefore take a priming screenshot first.
- In the automation window GSAP's lag smoothing caps each throttled frame at 33 ms, so a 0.7 s scrub takes many seconds to settle there. Headless runs, which render at full rate, settle normally; the end-to-end tests run headless.
- Three.js r187 logs two deprecation warnings that originate inside React Three Fiber (`THREE.Clock`, `PCFSoftShadowMap`). They are harmless.
- **A `next dev` server for this project was already running on port 3000** (not started by this build process). It was left running and used for visual checks. Next.js allows only one dev server per project directory.

## Technical debt

- `motion` (Framer Motion) is installed but not yet used; Phase 02 transitions are plain CSS. It will be used for discrete UI transitions or removed in Phase 10.

## Outstanding questions for Subash

These block publishing the affected content, not the build. Until answered the fields stay empty and are not rendered.

1. **Contact links.** LinkedIn URL, GitHub URL, and the email address to show publicly.
2. **Résumé.** The PDF to offer for download.
3. **Education.** Institution, qualification and years.
4. **Displayed title.** The brief uses "Senior Lead Software Engineer", "Lead Software Engineer" and "Technical Lead". Which one is the headline title? Working assumption: "Lead Software Engineer", matching the requested page title.
5. **Pearson / WSO2 (2013–2017).** Were these two successive employers, or one employer and one client or product? Until clarified the site shows the pairing exactly as written in the brief.
6. **Finago "approximately 50% UX improvement".** Is this figure verified and approved for publication, and what did it measure? It is withheld until confirmed.
7. **Optional.** Biosero engagement start date, location or time zone to display, and whether to state availability for new work.

## Next planned activities

Phase 07: complete the portfolio sections (introduction, about, expertise, projects, experience, education, contact, social links, résumé download), all usable without the flight. Contact links, the résumé and education are data-driven and render as soon as Subash supplies them (outstanding questions 1–3); nothing is invented in the meantime.
