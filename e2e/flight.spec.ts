import { type Page, expect, test } from "@playwright/test";

/** Scrolls so the flight section is at the given progress (0–1). */
async function scrollToProgress(page: Page, progress: number) {
  await page.evaluate((p) => {
    const section = document.getElementById("flight");
    if (!section) throw new Error("flight section missing");
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + p * (section.offsetHeight - window.innerHeight));
  }, progress);
}

test.describe("live flight", () => {
  // The 3D scene needs WebGL 2. Headless browsers without a GPU fall back to
  // software rendering, which is slow but sufficient for these checks.
  test.slow();

  test.beforeEach(async ({ page }) => {
    await page.goto("/?flight=live");
  });

  test("chooses live mode before paint and draws the scene", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("data-flight", "live");
    await expect(page.locator(".flight-canvas canvas")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("data-flight-ready", "true", {
      timeout: 45_000,
    });
  });

  test("keeps the opening text as the first thing a visitor reads", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Subash Rodrigo");
    await expect(page.getByText("Every journey begins with a takeoff.")).toBeInViewport();
  });

  test("lays chapters out at their true position on the timeline", async ({ page }) => {
    const layout = await page.evaluate(() => {
      const section = document.getElementById("flight");
      if (!section) throw new Error("flight section missing");
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const distance = section.offsetHeight - window.innerHeight;
      return [1, 2, 3, 4, 5, 6].map((n) => {
        const chapter = document.getElementById(`chapter-0${n}`);
        if (!chapter) throw new Error(`chapter ${n} missing`);
        const top = chapter.getBoundingClientRect().top + window.scrollY - sectionTop;
        return top / distance;
      });
    });
    const expected = [0.08, 0.22, 0.38, 0.51, 0.65, 0.84];
    layout.forEach((start, index) => {
      expect(start).toBeCloseTo(expected[index]!, 3);
    });
  });

  test("holds its scroll position instead of drifting", async ({ page }) => {
    // Regression: scroll anchoring once fought the sticky chapter panels and
    // scrolled the page by itself.
    for (const progress of [0.09, 0.3, 0.7]) {
      await scrollToProgress(page, progress);
      const before = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(1200);
      const after = await page.evaluate(() => window.scrollY);
      expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
    }
  });

  test("does not scroll horizontally", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("still reaches the portfolio below the flight", async ({ page }) => {
    await page.getByRole("link", { name: "Skip to portfolio" }).click();
    await expect(page).toHaveURL(/#about$/);
    await expect(page.locator("#about")).toBeInViewport();
  });
});
