import { expect, test } from "@playwright/test";

/**
 * The page foundation is tested in static mode, which is what crawlers,
 * reduced-motion visitors and browsers without WebGL receive. The live 3D
 * flight has its own spec.
 */
test.describe("page foundation (static experience)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?flight=static");
  });

  test("has one h1 with the name and title", async ({ page }) => {
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText("Subash Rodrigo");
    await expect(h1).toContainText("Lead Software Engineer");
  });

  test("shows the opening tagline as real text", async ({ page }) => {
    await expect(page.getByText("Every journey begins with a takeoff.")).toBeVisible();
    await expect(page.getByText("Mine began in 2013.")).toBeVisible();
  });

  test("exposes the main landmarks", async ({ page }) => {
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("renders all six chapters and the portfolio sections as HTML", async ({ page }) => {
    for (const id of [
      "chapter-01",
      "chapter-02",
      "chapter-03",
      "chapter-04",
      "chapter-05",
      "chapter-06",
      "about",
      "expertise",
      "projects",
      "experience",
      "contact",
    ]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    await expect(page.getByRole("heading", { name: "Engineering at Scale" })).toBeVisible();
    await expect(page.getByRole("table", { name: /Work experience/ })).toBeAttached();
  });

  test("does not start WebGL", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("data-flight", "static");
    await expect(page.locator(".flight-canvas canvas")).toHaveCount(0);
    // Every milestone is readable without scrolling through a flight.
    await expect(
      page.locator("#chapter-01").getByText("Close to 200 WSO2 ESB cloud connectors."),
    ).toBeVisible();
  });

  test("every in-page link points at an element that exists", async ({ page }) => {
    const hrefs = await page.locator('a[href^="#"]').evaluateAll((links) =>
      [...new Set(links.map((a) => a.getAttribute("href") ?? ""))].filter((h) => h.length > 1),
    );
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      if (href === "#top") continue; // resolved by the browser itself
      await expect(page.locator(href), `target of ${href}`).toHaveCount(1);
    }
  });

  test("skip link is the first stop and moves focus to the content", async ({ page }) => {
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("does not scroll horizontally", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("primary navigation reaches every section", async ({ page }) => {
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    if (!wide) {
      const toggle = page.getByRole("button", { name: "Open menu" });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
    const nav = page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });
    await expect(nav.getByRole("link")).toHaveText([
      "Home",
      "Career Journey",
      "Projects",
      "Experience",
      "Education",
      "About",
      "Contact",
    ]);
    await nav.getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(page.locator("#contact")).toBeInViewport();
    if (!wide) {
      // Choosing a destination closes the menu.
      await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    }
  });

  test("offers every way to get in touch", async ({ page }) => {
    const contact = page.locator("#contact");
    await expect(contact.getByRole("link", { name: /Email/ })).toHaveAttribute(
      "href",
      "mailto:subash.rodrigo@gmail.com",
    );
    for (const [name, href] of [
      [/LinkedIn.*opens in a new tab/, "https://www.linkedin.com/in/subash-rodrigo/"],
      [/GitHub.*opens in a new tab/, "https://github.com/SubashRandika"],
    ] as const) {
      const link = contact.getByRole("link", { name });
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    const resume = contact.getByRole("link", { name: /Résumé/ });
    await expect(resume).toHaveAttribute("href", "/resume.pdf");
    await expect(resume).toHaveAttribute("download", "Subash-Rodrigo-Resume.pdf");
    const pdf = await page.request.get("/resume.pdf");
    expect(pdf.ok()).toBe(true);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");

    const footer = page.getByRole("navigation", { name: "Contact and profiles" });
    await expect(footer.getByRole("link")).toHaveText([/Email/, /LinkedIn/, /GitHub/, /Résumé/]);
  });

  test("shows education", async ({ page }) => {
    const education = page.locator("#education");
    await expect(education).toContainText("Bachelor of Science in Computer Science (Special)");
    await expect(education).toContainText("University of Kelaniya, Sri Lanka");
  });
});

test.describe("reduced motion", () => {
  test("visitors who ask for reduced motion get the static experience", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-flight", "static");
    await expect(page.locator(".flight-canvas canvas")).toHaveCount(0);
  });
});
