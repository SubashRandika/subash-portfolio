import { expect, test } from "@playwright/test";

/**
 * Search and sharing metadata in the production build. The test server runs
 * on localhost, which is never a deployable domain, so the build must behave
 * as a preview: no indexing, no canonical URL, crawlers turned away.
 */
test.describe("search and sharing", () => {
  test.skip(({ isMobile }) => isMobile, "Head metadata does not depend on the device.");

  test("has the title, description and sharing cards", async ({ page }) => {
    await page.goto("/?flight=static");
    await expect(page).toHaveTitle("Subash Rodrigo | Lead Software Engineer | React, Angular & Full-Stack");
    const meta = (selector: string) => page.locator(selector).first().getAttribute("content");
    expect(await meta('meta[name="description"]')).toMatch(/^Subash Rodrigo is a Lead Software Engineer/);
    expect(await meta('meta[property="og:type"]')).toBe("profile");
    expect(await meta('meta[property="og:image"]')).toMatch(/\/og-image\.png$/);
    expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(await meta('meta[name="theme-color"]')).toBe("#070b14");
    // A preview build asks not to be indexed and claims no canonical URL.
    expect(await meta('meta[name="robots"]')).toBe("noindex, nofollow");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });

  test("publishes valid structured data about the person", async ({ page }) => {
    await page.goto("/?flight=static");
    const raw = await page.locator('script[type="application/ld+json"]').textContent();
    const data = JSON.parse(raw ?? "{}") as { "@graph": Array<Record<string, unknown>> };
    const person = data["@graph"].find((node) => node["@type"] === "Person");
    expect(person).toMatchObject({ name: "Subash Rodrigo", jobTitle: "Lead Software Engineer" });
    expect(data["@graph"].map((node) => node["@type"]).sort()).toEqual(["Person", "ProfilePage", "WebSite"]);
  });

  test("serves robots.txt, the sitemap, the manifest, icons and the sharing image", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBe(true);
    // Not on a real domain yet: nothing may be crawled.
    expect(await robots.text()).toMatch(/Disallow: \//);
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain("<loc>");
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).theme_color).toBe("#070b14");
    for (const path of ["/icon.svg", "/apple-icon.png", "/favicon.ico", "/og-image.png", "/images/subash-rodrigo.jpg"]) {
      expect((await request.get(path)).ok(), path).toBe(true);
    }
  });
});
