# Deploying The Career Flight

The site is a Next.js App Router application. The page is statically prerendered; images are optimised on demand by `next/image`, so it needs a host that runs Next.js (Vercel, or any Node.js host with `next start`). A pure static export is not used.

## 1. Before you deploy

Choose the production domain. It is deliberately not in the code: every absolute URL (canonical link, sitemap, robots.txt, sharing cards, structured data) is built from one environment variable.

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | **Yes** (production) | `https://www.example.com` | Public origin: https, no path, no trailing slash. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | No | `name@example.com` | Overrides the email in `src/data/profile.ts`. |
| `NEXT_PUBLIC_LINKEDIN_URL` | No | `https://www.linkedin.com/in/…` | Overrides the LinkedIn URL. |
| `NEXT_PUBLIC_GITHUB_URL` | No | `https://github.com/…` | Overrides the GitHub URL. |
| `NEXT_PUBLIC_RESUME_URL` | No | `/resume.pdf` | A PDF in `public/` or an https URL to a PDF. |

All variables are public (they are compiled into the page). See `.env.example`.

### The production guard

A production build refuses to complete unless:

- `NEXT_PUBLIC_SITE_URL` is a valid https origin that is not localhost, and
- at least one of email, LinkedIn or GitHub is published, and every supplied contact value is valid.

The guard runs for Vercel production deployments (`VERCEL_ENV=production`) and whenever `DEPLOY_ENV=production` is set. Preview deployments and local builds are unaffected. To run it locally:

```sh
NEXT_PUBLIC_SITE_URL=https://www.example.com npm run check:deploy
```

(PowerShell: `$env:NEXT_PUBLIC_SITE_URL="https://www.example.com"; npm run check:deploy`.)

### Preview builds stay out of search results

Until `NEXT_PUBLIC_SITE_URL` names a real domain, the site renders `noindex, nofollow`, publishes no canonical URL and its `robots.txt` disallows everything. Previews therefore never compete with the live site in search results.

## 2. Verify

```sh
npm ci
npm run verify      # lint, type check, unit tests, production build
npm run test:e2e    # end-to-end tests against the production build
```

## 3. Deploy to Vercel (recommended)

1. Import the repository in Vercel. The framework preset is detected (Next.js); keep the default build command (`next build`) and output settings.
2. In **Settings → Environment Variables**, add `NEXT_PUBLIC_SITE_URL` for the **Production** environment with the final domain. Leave it unset for **Preview** (previews are then non-indexable automatically).
3. Add the domain in **Settings → Domains** and point DNS at Vercel as instructed. Make the domain in `NEXT_PUBLIC_SITE_URL` the primary one, and redirect the other variant (with or without `www`) to it.
4. Deploy. A production deployment without a valid domain fails with "Production build refused" and lists what is missing.

## 4. Deploy elsewhere (any Node.js host)

```sh
npm ci
DEPLOY_ENV=production NEXT_PUBLIC_SITE_URL=https://www.example.com npm run build
npm run start -- --port 3000
```

Serve it behind HTTPS. `next start` serves the prerendered page, the optimised images and the metadata routes.

## 5. After the first deployment

- Open `https://<domain>/robots.txt`: it must allow crawling and name the sitemap.
- Open `https://<domain>/sitemap.xml` and `https://<domain>/manifest.webmanifest`.
- View the page source: the canonical link must point at the domain, and `robots` must be `index, follow`.
- Check the structured data with Google's Rich Results Test and the sharing card with a social card validator.
- Register the domain in Google Search Console and submit the sitemap.
- Run Lighthouse (desktop and mobile) and record the results in `PROJECT_PROGRESS.md`.

## Regenerating assets

These outputs are committed; regenerate them only when their sources change.

| Command | Produces |
| --- | --- |
| `npm run build:aircraft` | `public/models/sr-01.glb`, the aircraft model |
| `npm run build && npm run build:brand` | `src/app/icon.svg`, `apple-icon.png`, `favicon.ico`, `public/og-image.png`, `public/images/subash-rodrigo.jpg` |

`build:brand` renders the sharing image in Chrome with the site's own typefaces from the production build, which is why it runs after `npm run build`.

## Notes for operators

- The 3D flight runs only on browsers with hardware-accelerated WebGL 2; others, and visitors who prefer reduced motion or save data, get the static experience. `?flight=live` and `?flight=static` force either for testing; `?quality=high|medium|low` forces a graphics profile.
- On the first visit with Chrome or Edge on Windows, the terrain shader takes several seconds to compile in the background; the painted poster is shown meanwhile and the page stays responsive. Browsers cache compiled shaders, so later visits are quick.
