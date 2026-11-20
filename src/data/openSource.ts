import type { OpenSourceProject } from "@/types/portfolio";

/** Where the pinned repositories live. */
export const GITHUB_PROFILE = "https://github.com/SubashRandika";

/**
 * Subash's own open-source work: the repositories pinned on his GitHub
 * profile, in their pinned order, with Crown Clothing in place of Paleo
 * Sphere (his choice).
 *
 * Summaries are the repositories' descriptions (Crown Clothing's from its
 * README). Demo links are each repository's website, or the live demo its
 * README links. Stacks are read from each package.json. Screenshots
 * (src/assets/projects/) are of the live demos.
 */
export const openSourceProjects: readonly OpenSourceProject[] = [
  {
    repo: "sinha-giri",
    name: "Sinha Giri",
    summary:
      "A scroll-driven documentary: scroll position is the age of Sigiriya. The first half travels from 2026 back to 477 CE, the second returns to the present.",
    demo: "https://sinha-giri.vercel.app",
    source: `${GITHUB_PROFILE}/sinha-giri`,
    year: 2026,
    stack: ["Next.js", "Three.js", "React Three Fiber", "GSAP", "Tailwind CSS"],
    shot: "Sinha Giri's opening: the title “Sigiriya, Lion Rock” over an aerial view of the rock fortress rising from the forest.",
    accent: "#e0a04a",
  },
  {
    repo: "lumora",
    name: "Lumora",
    summary:
      "An unofficial, fan-made 3D spell-casting experience. Pick a spell from Harry Potter and the Philosopher's Stone, learn it, and cast it in a candlelit chamber.",
    demo: "https://lumora-tau-mauve.vercel.app",
    source: `${GITHUB_PROFILE}/lumora`,
    year: 2026,
    stack: ["Next.js", "Three.js", "React Three Fiber", "GSAP", "Zustand"],
    shot: "Lumora's home page: “Cast the Magic.” over a wall of spell names lit in gold.",
    accent: "#d6b26e",
  },
  {
    repo: "dream-haus",
    name: "DreamHaus",
    summary:
      "A house design tool for people who are not architects. Set out a plot of land, say which rooms you need, and get an editable house: a 2D plan and a 3D model that always show the same thing.",
    demo: "https://dream-haus.vercel.app",
    source: `${GITHUB_PROFILE}/dream-haus`,
    year: 2026,
    stack: ["Next.js", "Three.js", "React Three Fiber", "Zustand", "Claude API"],
    shot: "DreamHaus home page: “Draw a house you can walk around.” beside a 3D model of a two-storey house on its plot.",
    accent: "#e8336d",
  },
  {
    repo: "motio-code",
    name: "MotioCode",
    summary:
      "A motion-design studio for engineers. Build an explanation on a scene timeline, watch it play in the browser, and export it as video, without opening After Effects.",
    demo: "https://motio-code.vercel.app",
    source: `${GITHUB_PROFILE}/motio-code`,
    year: 2026,
    stack: ["Next.js", "Remotion", "Supabase", "Shiki", "Zustand"],
    shot: "MotioCode home page: “Bring your code and ideas to life.” beside a code walkthrough and its scene timeline.",
    accent: "#f5a524",
  },
  {
    repo: "aero-shield",
    name: "AeroShield",
    summary:
      "An interactive, cinematic 3D visualization that explains, step by step, the conceptual stages of how ballistic-missile defense systems work.",
    demo: "https://aero-shield-kappa.vercel.app",
    source: `${GITHUB_PROFILE}/aero-shield`,
    year: 2026,
    stack: ["Next.js", "Three.js", "React Three Fiber", "GSAP", "Radix UI"],
    shot: "AeroShield's first scenario: a 3D valley with a radar and launcher, a scenario panel, a detection panel and a playback timeline.",
    accent: "#6ea8e0",
  },
  {
    repo: "crown-clothing",
    name: "Crown Clothing",
    summary:
      "A complete e-commerce application for clothing: add products to the cart, check out with Stripe payments, and sign in with Google.",
    // The repository has no website set; this is the live demo its README links.
    demo: "https://crown-clothing-6aaca.web.app",
    source: `${GITHUB_PROFILE}/crown-clothing`,
    year: 2019,
    stack: ["React", "Redux", "Firebase", "Stripe", "Styled Components"],
    shot: "Crown Clothing's home page: photo tiles for hats, jackets, sneakers, women and men, each with a Shop now label.",
    accent: "#d0443e",
  },
];
