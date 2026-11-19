# THE CAREER FLIGHT

Cinematic 3D personal portfolio of Subash Rodrigo. Visitors follow an executive jet through six geographic environments, one for each chapter of a 13-year software engineering career. All career content is also available as ordinary semantic HTML.

## Requirements

- Node.js 22.12 or newer
- Google Chrome (used by the end-to-end tests)

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server at `http://localhost:3000` |
| `npm run build` | Create the production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate route types and run the TypeScript compiler |
| `npm run test` | Run unit and component tests (Vitest) |
| `npm run test:e2e` | Build, serve and run end-to-end tests (Playwright) |
| `npm run verify` | Lint, typecheck, unit tests and production build |
| `npm run check:deploy` | Production build with the deployment checks (needs `NEXT_PUBLIC_SITE_URL`) |
| `npm run build:aircraft` | Regenerate the aircraft model |
| `npm run build:brand` | Regenerate icons, portrait copy and sharing image (after `npm run build`) |
| `node scripts/copy-tech-icons.mjs <devicon package>` | Recopy the technology icons from an unpacked `devicon` package |

## Configuration

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL` to the public origin of the site. The production domain is not hardcoded anywhere; a production build refuses to complete without it. See [Deploying](docs/DEPLOYMENT.md).

End-to-end tests drive the installed Google Chrome by default. Set `PLAYWRIGHT_CHANNEL=msedge` to use Edge, or `PLAYWRIGHT_CHANNEL=bundled` to use Playwright's own Chromium.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deploying](docs/DEPLOYMENT.md)
- [Project progress](PROJECT_PROGRESS.md)
- [Project brief](CLAUDE.md)
