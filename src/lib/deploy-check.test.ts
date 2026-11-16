import { describe, expect, it } from "vitest";
import { deploymentProblems, isProductionDeploy } from "./deploy-check";

describe("deployment check", () => {
  it("refuses a production build without a real domain", () => {
    expect(deploymentProblems({}).join(" ")).toMatch(/NEXT_PUBLIC_SITE_URL is not set/);
    expect(deploymentProblems({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }).join(" ")).toMatch(
      /localhost/,
    );
    expect(deploymentProblems({ NEXT_PUBLIC_SITE_URL: "http://example.com" }).join(" ")).toMatch(/https/);
  });

  it("passes with an https domain and the published contact details", () => {
    expect(deploymentProblems({ NEXT_PUBLIC_SITE_URL: "https://www.example.com" })).toEqual([]);
  });

  it("reports contact details that fail validation", () => {
    const problems = deploymentProblems({
      NEXT_PUBLIC_SITE_URL: "https://www.example.com",
      NEXT_PUBLIC_LINKEDIN_URL: "not a url",
    });
    expect(problems.join(" ")).toMatch(/LinkedIn/);
  });

  it("applies to production deployments only", () => {
    expect(isProductionDeploy({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionDeploy({ DEPLOY_ENV: "production" })).toBe(true);
    expect(isProductionDeploy({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionDeploy({})).toBe(false);
  });
});
