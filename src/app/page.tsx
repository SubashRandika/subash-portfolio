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

export default function Home() {
  const currentRole = experience.find((entry) => entry.end === null);

  return (
    <main id="main" className="flex-1">
      <FlightSection profile={profile} chapters={chapters} />

      <div data-theme="day">
        <div className="shell">
          <About profile={profile} current={currentRole} />
          <Skills groups={skillGroups} />
          <Projects projects={projects} />
          <Experience entries={experience} />
          <Education entries={profile.education} />
        </div>
      </div>

      <Contact profile={profile} />
    </main>
  );
}
