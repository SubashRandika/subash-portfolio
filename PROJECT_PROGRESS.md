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
- **Wording (changed at Subash's request, 2026-11-16):** the flight is presented as the *career journey*. Navigation, HUD, buttons and chapter titles use plain career language rather than aviation terms ("Career Journey" not "Flight Experience"; "Laying the Foundations" not "First Takeoff"; "Leading the Way" not "Leading the Mission"; the HUD reads Career, Client, Experience instead of SR-01, Dest, Exp, T/O). The metaphor stays in the visuals and in the opening line ("Every journey begins with a takeoff."), which is what the visitor sees on screen at that moment. The closing line is now "Your next project could be our next chapter." (chosen by Subash, 2026-11-19; first changed from the brief's "The next mission could be ours.") Education is in the primary navigation.

## Status

| Phase | Name | Status |
| --- | --- | --- |
| 01 | Project inspection and architecture planning | Complete |
| 02 | Design system and responsive foundation | Complete |
| 03 | Aircraft and flight prototype | Complete |
| 04 | Master scroll timeline | Complete |
| 05 | Six realistic geographical environments | Complete |
| 06 | Career storytelling and milestone integration | Complete |
| 07 | Complete portfolio sections | Complete |
| 08 | Performance and accessibility optimization | Complete |
| 09 | SEO and deployment readiness | Complete |
| 10 | Final QA and release | Next |

**Current phase:** 10 — Final QA and release.

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
24. Sun shadows for the custom terrain and building shaders come from two depth maps rendered from the sun (detailed around the aircraft, coarse out to the mountains), compared in the shader. They are redrawn only when the aircraft has moved a good part of a map's width, the sun has turned or scenery has changed. Software renderers never get them, and any device that cannot hold about 40 fps with them on drops them for the rest of the visit.
25. Every moving part of the aircraft hangs from its own mesh-less pivot node. Mesh quantization folds a dequantizing offset into the transform of the node that holds a mesh, which would otherwise move a part's pivot off its hinge.
26. Buildings are assembled from ten instanced unit solids (box, gable, pyramid, dome, sphere, cone, taper, cooling tower, arch, cylinder) through a small "site" helper, so a building is described once in its own frame and stood anywhere. Features are placed whole or not at all if any part would stand in water.
27. Graphics profiles (`src/flight/quality.ts`): HIGH, MEDIUM and LOW, chosen from device signals and stepped down (never up) by a frame-time governor. The scene reads `getQuality()` each frame; React hears only about the rare change of profile.
28. The live flight is chosen in the head script only with hardware-accelerated WebGL 2 (`failIfMajorPerformanceCaveat`); without it the static experience is served, with no layout shift.
29. Large shaders compile in the background (`KHR_parallel_shader_compile` through `compileAsync`), and the terrain and buildings are shown only once compiled; the painted poster stays up until the ground is ready. Every other program is precompiled at startup, so nothing compiles mid-flight.
30. The terrain shader calls each costly helper (cars, car parks, tree crowns, street rows, the street itself) from one place: layout code records what lies under the pixel and main() draws it once. The Direct3D compiler copies a helper into the shader at every call site; this took the shader from 21 s to 8 s to compile on Windows.
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

### Phase 07 — Complete portfolio sections (complete; contact details awaiting Subash)

**Implemented:**

- All portfolio sections are server-rendered and reachable without the flight: introduction and about, technical expertise, selected projects (each linked to its flight chapter), work experience with the career timeline and logbook, education (shown once supplied), and contact.
- **Contact details and résumé** (`src/lib/contact.ts`, `src/lib/siteContact.ts`): taken from `src/data/profile.ts` or from deployment environment variables (`NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_LINKEDIN_URL`, `NEXT_PUBLIC_GITHUB_URL`, `NEXT_PUBLIC_RESUME_URL`, documented in `.env.example`). Each is validated (a real email form, https LinkedIn and GitHub profile URLs, a PDF in `public/` or on https); anything invalid is dropped with a build warning and never shown.
- Contact links appear in the contact section and in a footer "Contact and profiles" navigation, external links open in a new tab with `rel="noopener noreferrer"` and say so to screen readers, and the résumé is a download link.
- In development only, the contact section shows a reminder while no contact details are configured. Visitors never see it.
- The end-to-end build uses reserved example values (`hello@example.com`, `github.com/example`), so the populated contact section is tested in a real browser.

**Blocked on Subash (outstanding questions 1–3):** the real email, LinkedIn and GitHub addresses, the résumé PDF and education. The site deliberately publishes none of them until supplied. Phase 09's deployment check will refuse to pass while there is no way to get in touch.

**Files:** `src/lib/{contact,contact.test,siteContact}.ts`, `src/components/portfolio/Contact.tsx`, `src/components/layout/SiteFooter.tsx`, `src/app/{layout,page}.tsx`, `.env.example`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `src/components/components.test.tsx`.

**Verification (2026-11-16):**

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass, 98 of 98 in 10 files (new: contact validation and resolution) |
| `npm run test:e2e` | Pass, 66 of 66 (new: configured contact links in the section and the footer) |
| Visual review | Portfolio sections at 1440 × 900 and 390 × 844 |

### Realism pass (requested by Subash, 2026-11-16)

Requested: landing gear that retracts realistically, and terrain, buildings, roads, rivers and tanks that look real rather than like boxes and stripes.

**Aircraft and landing gear**
- Gear of realistic length (the airframe now stands 0.55 m higher), trailing-link main legs with leg doors, a nose leg with oleo, torque links and taxi lights, and squat aircraft tyres on dished wheels.
- The gear stays down through rotation and the first of the climb and is raised once climbing (as on a real departure). The nose leg moves first, the main legs follow, the nose doors close last.
- A two-link nose drag brace that folds at its knee as the leg swings forward, and a dark wheel well between the open doors.
- **Root cause of the "collapsing" nose gear:** mesh quantization had moved each moving part's pivot off its hinge, so the nose leg swung about a point half-way down itself. Fixed with separate pivot nodes (decision 25).
- `/lab/aircraft?view=nose&gear=0..1` shows the nose gear close up.

**Buildings** (`src/flight/structures.ts`, `src/components/environments/Structures.tsx`)
- Towers with podiums, setbacks and crowns (plant rooms, masts, pyramid roofs); mid-rise buildings with wings; perimeter blocks around courtyards; apartment slabs; retail sheds with car parks; pitched roofs; rooftop plant on flat roofs.
- Industrial sheds with multi-span metal roofs; tank farms (cone or dome roofs, bund walls, pipe racks, pressure spheres); silo rows with conveyors; cooling towers; tapered chimneys; gantry cranes over the container stacks; trailers at the docks.
- Airport terminal with an oversailing roof and piers, a tapering control tower with a glazed cab, hangars and a fuel farm.
- Bridges with parapets and piers; every third has a steel through-arch with hangers.
- Facades: curtain walls in three mullion styles, punched windows in brick or concrete with shopfronts and signs, balconies on flats, cladding with coloured bands and loading doors, tank plates with rust streaks and stairs; windows lit at dawn and dusk.

**Ground** (`src/components/environments/Terrain.tsx`)
- Roads with edge and centre lines and traffic; a dual carriageway with a planted reservation; city streets with lane markings, zebra crossings, stop lines, kerbs, paved footways, street trees, planted avenue medians, and moving and parked cars.
- Block interiors drawn to match the buildings: courtyards, lawns and paths, car parks with bays and cars, plazas with trees, parks with paths and ponds; suburb houses with pitched-roof shading and drives.
- Rivers with shingle bars, tree-lined banks, silt shallows and current lines; the city river between stone embankments with a riverside walk; the canal with walls and a towpath; surf that rolls in.
- A double-track railway; airfield concrete with joints, stand markings, hangar hardstanding and a car park; rock strata and scree on mountains; tramlines in fields.
- Sun shadows on the ground and buildings (decision 24).

**Performance**
- Detail smaller than a pixel or two (cars, tree crowns, bays) is skipped in the terrain shader rather than computed and blended away.
- Software renderers get half resolution and no shadows (`RenderProfile`, `SunShadows`).
- The live-flight end-to-end tests run one at a time per device: several software renderers at once starve the CPU (see known issues).

**Verification (2026-11-16)**

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass, 107 of 107 (new: gear sequence, folding drag brace keeps both links whole, shadow frame budget, structures placed whole and dry) |
| `npm run test:e2e` | Pass, 72 of 72, twice in a row |
| Visual review | Gear at 0, 0.25, 0.5, 0.75 and 1 in the lab; takeoff, every chapter at 1280 × 720 |
| Frame pacing (AMD Radeon 860M, production build, 30 s scroll) | With shadows off, a steady 17 ms in every tenth of the flight (cool machine). With shadows on, the second half of the flight dropped to 33 ms frames. Later runs were affected by thermal throttling (shadows-off runs also slowed), so no clean on/off comparison was possible; the adaptive fallback covers devices that cannot afford shadows. |

### Portrait in About (2026-11-16)

Subash supplied two portraits: an illustrated one (headphones, paint splashes) and a professional photograph (light blue blazer). The photograph was chosen: it suits the restrained, document-like design system and is what recruiters and clients expect; the illustration's comic style would clash with it.

- `src/assets/subash-rodrigo-portrait.jpg`: head-and-shoulders crop (4:5, 960 × 1200) of the photograph, with the blue decorative arc beside the head painted out from the surrounding background. Served through `next/image` (AVIF/WebP, responsive sizes, blur placeholder).
- `src/components/portfolio/Portrait.tsx`: a "Fig. 01" figure plate beside the About text (above it on narrow screens). A white plate the photograph's white background melts into, viewfinder corners in the accent colour, and a dashed orbit with two travelling dots circling behind it (a nod to the arc and dots in the original photograph).
- Entrance on first view: the plate wipes open behind a sweeping scan line, the photograph develops from a soft monochrome into colour, then the orbit, corners and caption settle in. A fine pointer tilts the plate slightly in 3D with a sheen that follows it. No React state is touched per frame.
- Without JavaScript, with reduced motion, or when already on screen at load, the figure is simply shown. Alt text: "Subash Rodrigo, Lead Software Engineer".
- Tests: unit (image, caption, fallback without IntersectionObserver or matchMedia) and end-to-end (held back below the fold, revealed on scroll, image actually loads; shown at once with reduced motion).
- For Phase 09: this image can be the `image` of the Person JSON-LD and a basis for the Open Graph image.

### Phase 08 — Performance and accessibility optimization (complete)

**Implemented:**

- **Graphics profiles** HIGH, MEDIUM and LOW (pixel ratio, sun shadows, terrain detail and build budget, light glows, rooftop detail). Software rendering, save-data and very small devices start on LOW; phones, small screens and modest devices on MEDIUM; the rest on HIGH. A governor steps down if real frame times average over 25 ms. `?quality=high|medium|low` forces one; the choice is recorded on `<html data-flight-quality>`. This is the lighter mobile scene the brief asks for.
- **No hardware acceleration, no 3D:** the head script probes for hardware-accelerated WebGL 2 and serves the static experience otherwise (a software-rendered flight runs at a few frames a second).
- **Stalls removed:** districts are laid out a few milliseconds per frame and cached; all materials (including the hidden cloud deck and the shadow pass's depth programs) are precompiled; the terrain and building shaders compile in the background and are shown only when ready. A full flight now has no shader compiles after startup and one long task of about 60 ms (previously 290–350 ms stalls).
- **Windows shader compile:** the terrain shader took 21 s to compile on Direct3D (Chrome and Edge on Windows), freezing the page. Restructured (decisions 29–30) to 8 s, and that 8 s now runs in the background with the page fully responsive; Chrome caches compiled shaders, so return visits are fast.
- **Accessibility:** axe-core WCAG 2.2 AA audits added to the end-to-end suite for the static page, the open mobile menu and the live flight (opening and a chapter). One violation found and fixed: header link contrast over light sections (header now 90 % opaque, about 6.6:1).
- **Portrait clipping** fixed (orbit and corners kept inside their column) with a regression check.

**Verification (2026-11-16):**

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` | Pass |
| `npm run test` | Pass, 122 of 122 (new: profiles and governor, head-script mode choice, portrait) |
| `npm run test:e2e` | Pass, 83 passed, 1 skipped by design (new: axe audits, chosen profile, portrait overhang) |
| Frame pacing, HIGH with shadows (Radeon 860M, 1440 × 900, 30 s scroll) | Median 17 ms, p95 17–18 ms in every tenth of the flight; one long task of about 60 ms |
| Terrain shader compile (Direct3D 11) | 21 s → 8 s, now off the main thread |
| Lighthouse desktop (local production build) | Performance 82, Accessibility 100, Best Practices 100, SEO 100; LCP 0.8 s, TBT 390 ms, CLS 0 |
| Lighthouse mobile (simulated slow 4G, 4× CPU) | Performance 60, Accessibility 100, Best Practices 100, SEO 100; LCP 3.8 s, TBT 2.3 s, CLS 0 |
| Lighthouse mobile, static experience | Performance 93 |

**Limitations:**

- Mobile Lighthouse performance (60) is below the 90 target. The remaining blocking time under 4× CPU throttling is React hydration of the long page (about 0.9 s), the scroll director's setup (about 1.1 s) and the 3D bootstrap (about 0.3 s). Options for Phase 10: start the 3D and the director after the first interaction on touch devices, or split the director's setup across frames.
- On a first visit with Chrome or Edge on Windows the 3D ground appears about 8 s after load (the poster shows meanwhile); later visits use Chrome's shader cache. Splitting the terrain shader into region variants would shorten this further.

### Phase 09 — SEO and deployment readiness (complete)

**Implemented:**

- **Metadata** (`src/lib/seo.ts`): the brief's title and description, `metadataBase` from `NEXT_PUBLIC_SITE_URL`, canonical URL, Open Graph (`profile`, first and last name, 1200 × 630 image) and X `summary_large_image` card, author and application name, theme colour.
- **Structured data:** Person, WebSite and ProfilePage linked by `@id`, built only from the page's own content: name, title, summary, portrait, current employer (Creative Software), education (University of Kelaniya), expertise, and the published email, LinkedIn and GitHub. Inline script text is escaped so it cannot close its tag.
- **Preview safety:** until `NEXT_PUBLIC_SITE_URL` is a real https domain the page is `noindex, nofollow`, publishes no canonical URL, and `robots.txt` disallows everything. On the real domain `robots.txt` allows crawling (except `/lab/` and `/styleguide`) and names the sitemap.
- `robots.txt`, `sitemap.xml` and `manifest.webmanifest` as Next.js metadata routes.
- **Brand assets** (`npm run build:brand`): an SVG site icon (a rising trajectory over a dawn horizon, no lettering), `apple-icon.png`, a multi-size `favicon.ico` replacing the template one, the portrait at a stable URL for structured data, and a sharing image rendered in Chrome with the site's own typefaces.
- **Production guard** (`src/lib/deploy-check.ts`, `next.config.ts`): a production deployment (`VERCEL_ENV=production` or `DEPLOY_ENV=production`) refuses to build without a valid https domain and a way to get in touch, and lists what is missing. `npm run check:deploy` runs it locally.
- **Deployment guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (environment variables, Vercel and Node.js hosting, post-deployment checks, regenerating assets).
- Found during the phase: the portrait's "held back" state faded out over 0.7 s after load, so an audit could catch semi-transparent text. Hiding is now instant; only the reveal animates.

**Verification (2026-11-16):**

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` | Pass |
| `npm run test` | Pass, 134 of 134 (new: metadata, structured data, deployment guard) |
| `npm run test:e2e` | Pass, 86 passed, 7 skipped by design (new: head metadata, JSON-LD, robots, sitemap, manifest, icons) |
| Production guard | A production build without `NEXT_PUBLIC_SITE_URL` stops with "Production build refused" |

**Outstanding before going live (needs Subash):** the production domain. Everything else for deployment is in place.

### Technology table in Technical expertise (2026-11-19)

Requested by Subash: present the technologies from his résumé creatively, using Devicon icons.

- **Content** (`src/data/technologies.ts`): the technologies from the résumé (60 after Subash's 2026-11-19 edits)'s Competencies & Skills, in five families that follow its own headings (languages and markup; frontend; backend and data; testing, build and DevOps; tools and AI). No proficiency levels or years, because the résumé gives none. `core` marks the primary expertise named in the brief (TypeScript, JavaScript, React, Next.js, Angular). Practices are kept apart in `src/data/skills.ts`: Microservices and REST APIs moved into Architecture, and a new "Ways of working" group holds Agile (Scrum), Kanban, code review and technical interviewing (the last two from the résumé's IFS bullets). Storybook moved from Quality into the table.
- **Design** (`TechTable.tsx`): a periodic table. Each tile carries a number, a two-letter symbol, the Devicon logo and the name, coloured by family. The core stack has two-by-two tiles. The legend is a set of toggle buttons (`aria-pressed`, announced politely) that brings one family forward. Tiles cascade in on first view; hiding is instant, only the reveal animates; nothing moves with reduced motion.
- **Icons:** 56 Devicon 2.18.0 icons (MIT) and 4 Simple Icons marks (CC0) copied into `public/tech/` by `scripts/copy-tech-icons.mjs`, with the licence beside them. Only the icons used are copied, so the 140 MB package is not a dependency. The script prefers the coloured variant, falls back to the plain one for heavy illustrations, adds the SVG namespace where Devicon omits it (GitHub Copilot's icon did not render as an image without it) and refuses files with active content. Where Devicon has no icon, the brand mark comes from Simple Icons 16.38.0 (CC0, licence beside it): Google Gemini (in its blue-to-rose gradient), React Query's logo for the TanStack Query / Table tile (at Subash's request; the general TanStack emblem was not the right mark), Testing Library and Apache Superset, so every tile has its logo. At Subash's request (2026-11-19) the table lists "Testing Library" (not React Testing Library) and "Material UI" with the MUI logo (not Material CDK / UI), and drops TestNG, Pentaho BI, WSO2 ESB and Druid; those still appear in the career story where they belong. 60 technologies.
- Structured data (`knowsAbout`) now lists the technologies and practices.

### Résumé download in the opening (2026-11-19)

- Requested by Subash: a creative résumé download in the home hero. `ResumeDownload` (src/components/storytelling) sits beside "Begin the journey" and before "Skip to portfolio". It is drawn as a two-page document with the format, page count and size (`PDF · 2 pages · 99 KB`), read from public/resume.pdf at build time by `src/lib/resume.ts`, so it never goes stale. Hover or focus fans the pages and writes the lines in; a click files the top page into a tray, the arrow becomes a tick, the meta line reads "Download started" and a polite live region announces it, then the card resets after 2.6 s. The pages fan out once after the opening settles, never on a loop. Reduced motion keeps only the icon and text swap.
- A plain link with `download`, so it works without JavaScript. Its accessible name starts with the visible label ("Download résumé, PDF, 2 pages, 99 KB"). A résumé hosted on another domain opens in a new tab instead.
- Layout: name and actions share one row from 80rem; below that the actions form their own row, and on phones they stack.
- The file read is marked `turbopackIgnore`: the page is prerendered, so the server never needs the PDF and the whole project is not traced into the output.
- Tests: `src/lib/resume.test.ts` (page count, size format, hosted and missing files), `ResumeDownload.test.tsx` (name, download attribute, confirmation and reset, hosted variant) and a hero check in `e2e/smoke.spec.ts`. Unit 145 of 145, end-to-end 89 passed and 7 skipped.

### Opening sky and a lighter menu (2026-11-19)

- **Menu:** "Career Journey" removed from the top menu at Subash's request. "Begin the journey", directly below it in the opening, goes to the same place, and the HUD's chapter rail still reaches every chapter. (This departs from the brief's navigation list by his decision.)
- **Cirrus** (`shaders/cirrus.glsl.ts`, drawn by `Sky.tsx`): thin high cloud in the sky dome. Four-octave value noise projected onto a high deck, so wisps foreshorten toward the horizon, streaked along the wind and drifting slowly; the finer octaves move on their own so wisps change shape too. Lit from below by the dawn glow and by the sun once it is up. Cover is a new keyframed `cirrus` field in `atmosphere.ts`: 0.8 before dawn, 0.3 at midday, 0.55 in the golden hour.
- **Stars** (`Stars.tsx`): replace the one-pixel stars that were in the sky shader. 1,100 seeded points (identical on every visit), additive sprites with a sharp core, a soft halo and, for the brightest, hairline spikes; colours by temperature, a steep magnitude curve (most are faint), and scintillation that is stronger and faster near the horizon. They fade into the glow low over the sun, hide behind the cirrus and inside cloud, and are not drawn once the sky is light. First version was 2,600 stars; Subash found it too busy, so the field was thinned to 1,100 with the faint ones dimmer.
- Reduced-motion visitors get the static page, so the drift and twinkle never reach them.
- Tests: cirrus cover per look (`atmosphere.test.ts`), star field determinism, placement and magnitude spread (`Stars.test.ts`); menu expectation updated. Unit 148 of 148, end-to-end 89 passed and 7 skipped.

### Opening text: legibility and entrance (2026-11-19)

- Requested by Subash: the hero text did not catch the eye. The headline sat on the busiest part of the scene, so the opening copy now carries its own soft shade (a radial and a bottom gradient behind the text column, full-bleed, fading with the copy as the takeoff begins) and a text shadow. The name is larger (up to 2.625rem, one line) and the role line brighter; the actions sit on their own row below the name at every width.
- Entrance (CSS only, about two seconds, once; settled state for reduced motion): the tagline's words come into focus in turn (blur, rise and fade from 12% opacity, so the headline still paints at once and remains the LCP element); a band of dawn light passes across the words; "2013" is set bold and underlined as the line rises; the rule above the name draws in from an accent end with a spark running along it; the name rises out of a mask; the role and the three actions follow; the scroll cue's light slides down its track three times and stops.
- The tagline is split into one span per word with the spaces kept as text, so it reads and is found exactly as written. Measured LCP locally 0.5–0.7 s.
- The accessibility audit now waits for the entrance to settle before checking contrast. Unit 148 of 148, end-to-end 89 passed and 7 skipped.

### Résumé facts read in a cached function (2026-11-20)

- With `cacheComponents`, reading the résumé PDF synchronously during render was flagged by the dev server ("unstable value while prerendering"). `loadResume` (`src/lib/resume.ts`) now reads it inside `"use cache"` with `cacheLife("max")`; the page stays static.

### Personal projects (2026-11-20)

- Requested by Subash: his pinned GitHub work as an open-source section, each card opening its live demo. New section **Personal projects** (`#open-source`) after Selected projects: `src/components/portfolio/OpenSource.tsx`, data in `src/data/openSource.ts`, type `OpenSourceProject`.
- Projects, in pinned order: Sinha Giri, Lumora, DreamHaus, MotioCode, AeroShield, and **Crown Clothing in place of Paleo Sphere (Subash's choice)**. Summaries are the repository descriptions (two lightly tidied: a stray underscore and a grammar slip); demo links are each repository's website, or for Crown Clothing the live demo its README links (`crown-clothing-6aaca.web.app`); stacks are read from each `package.json`; years from the creation dates.
- Each card is a small browser window (address bar with the demo's host and a pulsing "Live" dot) showing a screenshot of the live demo. The whole card is the demo link (opens in a new tab); a separate Source link opens the repository. Entrance: cards rise in turn and each screen switches on like a monitor. A fine pointer tilts the window and moves a sheen across it; the window glows in the project's own colour on hover or focus. All motion is skipped for reduced motion.
- Screenshots were taken at 2× (2880×1800, Sinha Giri's after its loading screen clears) and stored as 2400×1500 WebP in `src/assets/projects/`; served by next/image at quality 90 (`images.qualities` in `next.config.ts`). Layout: one card per row on phones, two from 48rem, three from 80rem (Subash's preference for large screens), inside the text column. The window is only 3D-transformed while tilting, so the screenshot is drawn sharp at rest.
- Tests: unit (cards, links, alt text, profile link, data) and end-to-end (reveal, screenshots load, a click anywhere on the card hits the demo link while the Source link stays on top); the accessibility audit waits for the cards' entrance. Unit 152 of 152, end-to-end 92 passed and 7 skipped.

### Slimmer work experience (2026-11-20)

- Requested by Subash: the Work column repeated what the career journey and the résumé already say. The table now keeps period, role, employer and client (with the role on each engagement), and a new "In the career journey" column links each row to its chapters (number and title) in place of the bullet list. The section note says what was built is told in the journey. The `highlights` stay in `src/data/experience.ts` as the record of facts but are no longer shown here. About a third of the previous height on desktop. Unit 153 of 153, end-to-end 92 passed and 7 skipped.

## Known issues

- **Playwright's bundled Chromium cannot run on this machine.** Windows reports "An Application Control policy has blocked this file" for the unsigned `chrome-headless-shell.exe`. The policy was left untouched. Tests use the installed, signed Google Chrome through `channel: "chrome"`; the blocked download was removed with `npx playwright uninstall`.
- **`npm audit` reports 8 moderate advisories**, all inside the ESLint toolchain pulled in by `eslint-config-next`. They are development-only and are not shipped. Re-checked in Phase 10: still development-only (`minimatch` in the ESLint toolchain); `npm audit --omit=dev` reports 0 vulnerabilities in shipped dependencies.
- **Blender is not installed**, so asset preparation is done in code.
- **The dev server's file watcher sometimes misses stylesheet writes** on this machine (seen with Turbopack on Windows). Re-saving `src/app/globals.css` triggers the rebuild. Production builds are unaffected.
- **Browser automation only renders frames when a screenshot forces one**, because the automation window is occluded and `requestAnimationFrame` is throttled. Visual checks therefore take a priming screenshot first.
- In the automation window GSAP's lag smoothing caps each throttled frame at 33 ms, so a 0.7 s scrub takes many seconds to settle there. Headless runs, which render at full rate, settle normally; the end-to-end tests run headless.
- Three.js r187 logs two deprecation warnings that originate inside React Three Fiber (`THREE.Clock`, `PCFSoftShadowMap`). They are harmless.
- **A `next dev` server for this project was already running on port 3000** (not started by this build process). It was left running and used for visual checks. Next.js allows only one dev server per project directory.

- **Frame pacing on this laptop varies with its thermal state** by up to 2×, so single benchmark runs are unreliable. Compare runs taken back to back, alternating `?shadows=off`.
- **Live-flight end-to-end tests are CPU-bound** under software rendering. They run one per device project (`*-flight`), which keeps the suite at about 1.5 minutes; raising their parallelism makes them time out.

## Technical debt

- ~~`motion` installed but unused.~~ Removed in Phase 10: every UI transition is plain CSS.
- Mobile Lighthouse performance (lab) is 60, below the 90 target; see Phase 10 limitations.

## Outstanding questions for Subash

These block publishing the affected content, not the build. Until answered the fields stay empty and are not rendered.

1. ~~**Contact links.**~~ Answered 2026-11-16: email, LinkedIn and GitHub supplied and published.
2. ~~**Résumé.**~~ Answered 2026-11-16: `public/resume.pdf` supplied (phone number removed at Subash's request; town kept), offered as "Subash-Rodrigo-Resume.pdf" from the contact section and footer.
3. ~~**Education.**~~ Answered 2026-11-16: BSc in Computer Science (Special), University of Kelaniya, Sri Lanka, graduated 2013.
4. ~~**Displayed title.**~~ Answered 2026-11-16: "Lead Software Engineer" confirmed.
5. ~~**Pearson / WSO2 (2013–2017).**~~ Answered 2026-11-16: two employments. Virtusa (17 Jun 2013–2015) for client WSO2, then JKCS (2015–14 Apr 2017) for client Pearson (MyDashboard). The month of the 2015 move was not given, so it is shown as the year only.
6. ~~**Finago "approximately 50% UX improvement".**~~ Answered 2026-11-16: confirmed. Per the résumé it came from the simplified customer-creation wizard, so it is published there.
7. **Optional.** Biosero engagement start date, location or time zone to display, and whether to state availability for new work.
8. **Production domain.** Needed to deploy: set `NEXT_PUBLIC_SITE_URL` (see docs/DEPLOYMENT.md). Until then builds are safe previews that ask not to be indexed.

## Next planned activities

Phase 10: final QA across desktop, tablet and mobile; full accessibility, SEO and performance audits; another look at mobile Lighthouse performance (deferring the 3D and the scroll director on touch devices); `npm audit` and dependency review (including the unused `motion` package); the final implementation report.
