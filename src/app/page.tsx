import { About } from "@/components/portfolio/About";
import { Contact } from "@/components/portfolio/Contact";
import { Education } from "@/components/portfolio/Education";
import { Experience } from "@/components/portfolio/Experience";
import { Projects } from "@/components/portfolio/Projects";
import { Skills } from "@/components/portfolio/Skills";
import { FlightSection } from "@/components/storytelling/FlightSection";
import { chapters } from "@/data/chapters";
import { experience } from "@/data/experience";
import { profile } from "@/data/profile";
import { projects } from "@/data/projects";
import { skillGroups } from "@/data/skills";
import { technologies } from "@/data/technologies";
import { buildJsonLd, jsonLdScript } from "@/lib/seo";
import { siteContact } from "@/lib/siteContact";

export default function Home() {
  const currentRole = experience.find((entry) => entry.end === null);

  return (
    <main id="main" className="flex-1">
      <script
        type="application/ld+json"
        // Structured data for search engines, built from the same content.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildJsonLd()) }}
      />
      <FlightSection profile={profile} chapters={chapters} />

      <div data-theme="day">
        <div className="shell">
          <About profile={profile} current={currentRole} />
          <Skills technologies={technologies} groups={skillGroups} />
          <Projects projects={projects} />
          <Experience entries={experience} />
          <Education entries={profile.education} />
        </div>
      </div>

      <Contact profile={profile} links={siteContact.links} />
    </main>
  );
}
