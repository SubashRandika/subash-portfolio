import { DocSection } from "@/components/ui/DocSection";
import type { ExperienceEntry, Profile } from "@/types/portfolio";
import { Portrait } from "./Portrait";

interface AboutProps {
  profile: Profile;
  /** The current employment, used for the "Now" fact. */
  current: ExperienceEntry | undefined;
}

export function About({ profile, current }: AboutProps) {
  const [lead, ...rest] = profile.summary;

  const facts: Array<{ term: string; detail: string }> = [
    {
      term: "Experience",
      detail: `${profile.yearsOfExperience} years, since ${profile.careerStartYear}`,
    },
  ];
  if (current?.employer) {
    facts.push({ term: "Now", detail: `${current.role}, ${current.employer}` });
  }
  facts.push({ term: "Works in", detail: "React, Next.js, Angular, TypeScript" });

  return (
    <DocSection id="about" title="About">
      <div className="about-layout">
        <div className="max-w-3xl">
          <p className="type-lead">{lead}</p>
          {rest.map((paragraph) => (
            <p key={paragraph} className="mt-5 text-ink-muted">
              {paragraph}
            </p>
          ))}
        </div>
        <Portrait name={profile.name} title={profile.title} since={profile.careerStartYear} />
      </div>

      <dl className="mt-10 grid max-w-3xl gap-x-10 border-t border-line sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.term} className="border-b border-line py-4 sm:border-b-0">
            <dt className="type-label text-ink-muted">{fact.term}</dt>
            <dd className="mt-1.5 font-bold">{fact.detail}</dd>
          </div>
        ))}
      </dl>
    </DocSection>
  );
}
