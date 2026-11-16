import type { Metadata } from "next";
import { FlightHUD } from "@/components/storytelling/FlightHUD";
import { MilestoneCard } from "@/components/storytelling/MilestoneCard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { chapters, getChapter } from "@/data/chapters";
import { profile } from "@/data/profile";

export const metadata: Metadata = {
  title: "Design system — Career Journey",
  robots: { index: false, follow: false },
};

const swatches = [
  ["Night 900", "bg-night-900"],
  ["Night 800", "bg-night-800"],
  ["Night 700", "bg-night-700"],
  ["Graphite 600", "bg-graphite-600"],
  ["Haze 400", "bg-haze-400"],
  ["Pearl 100", "bg-pearl-100"],
  ["Cloud 100", "bg-cloud-100"],
  ["Ink 900", "bg-ink-900"],
  ["Dawn 400", "bg-dawn-400"],
  ["Dawn 700", "bg-dawn-700"],
  ["Nav 300", "bg-nav-300"],
  ["Nav 700", "bg-nav-700"],
] as const;

const icons: IconName[] = [
  "arrow-down",
  "arrow-right",
  "arrow-up-right",
  "menu",
  "close",
  "download",
  "mail",
  "linkedin",
  "github",
];

const themes = ["night", "day", "dusk"] as const;

/** Internal reference page for the design system. Not linked or indexed. */
export default function Styleguide() {
  const sampleChapter = getChapter(5);

  return (
    <main id="main" className="flex-1 pt-(--header-height)">
      <div className="shell section-space">
        <p className="type-label text-ink-muted">Internal reference</p>
        <h1 className="type-display-lg mt-4">Design system</h1>

        <h2 className="type-display-md mt-16">Palette</h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {swatches.map(([name, className]) => (
            <li key={name}>
              <div className={`${className} h-16 rounded-[3px] border border-line`} />
              <p className="type-label mt-2 text-ink-muted">{name}</p>
            </li>
          ))}
        </ul>

        <h2 className="type-display-md mt-16">Type</h2>
        <div className="mt-6 grid gap-6">
          <p className="type-display-xl">Every journey begins with a takeoff.</p>
          <p className="type-display-lg">Building Momentum</p>
          <p className="type-display-md">Work experience</p>
          <p className="type-lead max-w-2xl">
            Lead: building enterprise-grade frontend platforms, scalable architecture, and reusable
            design systems.
          </p>
          <p className="max-w-2xl">
            Body: B612 was designed for aircraft cockpit displays, where a glance has to be enough.
            <em> Italic for the personal voice.</em> <strong>Bold for emphasis.</strong>
          </p>
          <p className="type-small text-ink-muted">Small: supporting detail and captions.</p>
          <p className="type-label">Label · Chapter 02 / 06</p>
          <p className="type-data">Data 0123456789 · 034 %</p>
        </div>

        <h2 className="type-display-md mt-16">Icons</h2>
        <ul className="mt-6 flex flex-wrap gap-6">
          {icons.map((name) => (
            <li key={name} className="grid justify-items-center gap-2">
              <Icon name={name} size={24} />
              <span className="type-label text-ink-muted">{name}</span>
            </li>
          ))}
        </ul>
      </div>

      {themes.map((theme) => (
        <section key={theme} data-theme={theme} className="border-t border-line py-14">
          <div className="shell">
            <h2 className="type-display-md">Theme: {theme}</h2>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button icon="arrow-down">Begin the journey</Button>
              <Button variant="secondary">Secondary</Button>
              <ButtonLink href="#main" variant="quiet">
                Quiet link
              </ButtonLink>
              <Button disabled>Disabled</Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2">
              {["TypeScript", "React", "Micro-frontend architecture"].map((tag) => (
                <li key={tag} className="tag">
                  {tag}
                </li>
              ))}
            </ul>
            <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sampleChapter.milestones.slice(0, 3).map((milestone, index) => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  chapter={sampleChapter.number}
                  position={index + 1}
                />
              ))}
            </ol>
          </div>
        </section>
      ))}

      <section data-theme="night" className="border-t border-line">
        <div className="shell py-14">
          <h2 className="type-display-md">Flight HUD</h2>
          <p className="type-small mt-3 text-ink-muted">
            Shown at 34 % progress in chapter 2, over the painted sky used before the 3D scene loads.
          </p>
        </div>
        <div className="sky relative h-[70svh] min-h-[26rem] overflow-hidden" data-sky="2">
          <FlightHUD chapters={chapters} profile={profile} segment={2} progress={0.34} />
        </div>
      </section>
    </main>
  );
}
