import type { Metadata, Viewport } from "next";
import { B612, B612_Mono, Michroma } from "next/font/google";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { profile } from "@/data/profile";
import "./globals.css";

// Titles: wide, engineered capitals in the aerospace instrument tradition.
const michroma = Michroma({
  variable: "--font-michroma",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

// Reading text: B612, the typeface Airbus commissioned for cockpit displays.
const b612 = B612({
  variable: "--font-b612",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

// Data and labels: the monospaced companion to B612.
const b612Mono = B612_Mono({
  variable: "--font-b612-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Subash Rodrigo | Lead Software Engineer | React, Angular & Full-Stack",
  description:
    "Subash Rodrigo is a Lead Software Engineer with 13+ years of experience building high-performance web applications, enterprise software, React, Angular, SaaS platforms and scalable digital experiences.",
};

export const viewport: Viewport = {
  themeColor: "#070b14",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${michroma.variable} ${b612.variable} ${b612Mono.variable} antialiased`}
    >
      <body data-theme="night" className="flex min-h-svh flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader name={profile.name} />
        {children}
        <SiteFooter name={profile.name} />
      </body>
    </html>
  );
}
