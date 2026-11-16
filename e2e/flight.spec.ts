import AxeBuilder from "@axe-core/playwright";
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
    // Software rendering loads and compiles the 3D scene on the CPU; with the
    // other test workers sharing it, the first frame can take a while.
    await expect(page.locator(".flight-canvas canvas")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator("html")).toHaveAttribute("data-flight-ready", "true", {
      timeout: 120_000,
    });
    // A graphics profile is chosen from the device and recorded on the page.
    await expect(page.locator("html")).toHaveAttribute("data-flight-quality", /^(high|medium|low)$/);
  });

  test("has no automated accessibility violations at the opening or in a chapter", async ({
    page,
  }) => {
    const audit = async () =>
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    await expect(page.locator("#chapter-01 [data-flight-part='body']")).toBeHidden({
      timeout: 30_000,
    });
    expect(await audit()).toEqual([]);
    await scrollToProgress(page, 0.15);
    await expect(page.locator("[data-hud='percent']")).toHaveText("015", { timeout: 15_000 });
    expect(await audit()).toEqual([]);
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

  test("drives the HUD and chapter text in both directions", async ({ page }) => {
    const percent = page.locator("[data-hud='percent']");
    const chapter = page.locator("[data-hud='chapter-count']");
    const opening = page.locator("[data-flight-part='opening']");
    const body = (n: number) => page.locator(`#chapter-0${n} [data-flight-part='body']`);

    // The director is loaded on demand; wait until it owns the chapter text.
    await expect(body(1)).toBeHidden({ timeout: 30_000 });
    await expect(opening).toBeVisible();

    const visit = async (progress: number, segment: string, visibleChapter: number | null) => {
      await scrollToProgress(page, progress);
      await expect(percent).toHaveText(String(Math.round(progress * 100)).padStart(3, "0"), {
        timeout: 15_000,
      });
      await expect(chapter).toHaveText(segment);
      if (visibleChapter === null) return;
      await expect(body(visibleChapter)).toBeVisible();
      for (const other of [1, 2, 3, 4, 5, 6].filter((n) => n !== visibleChapter)) {
        await expect(body(other)).toBeHidden();
      }
    };

    // Forward…
    await visit(0.15, "01 / 06", 1);
    await visit(0.45, "03 / 06", 3);
    await visit(0.75, "05 / 06", 5);
    await expect(opening).toBeHidden();
    // …and back again, skipping chapters on the way.
    await visit(0.3, "02 / 06", 2);
    await visit(0.15, "01 / 06", 1);
    await visit(0, "Start", null);
    await expect(opening).toBeVisible();
    for (const n of [1, 2, 3, 4, 5, 6]) await expect(body(n)).toBeHidden();
  });

  test("lights one milestone at a time and reverses cleanly", async ({ page }) => {
    const lit = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("#chapter-02 [data-milestone]"))
          .filter((card) => Number(getComputedStyle(card).getPropertyValue("--lit")) > 0.5)
          .map((card) => card.dataset.milestone),
      );

    await expect(page.locator("#chapter-01 [data-flight-part='body']")).toBeHidden({
      timeout: 30_000,
    });
    // Chapter 02 runs 0.22–0.38; its milestones spread across the middle.
    await scrollToProgress(page, 0.3);
    await expect.poll(lit, { timeout: 15_000 }).toHaveLength(1);
    const middle = (await lit())[0];
    await scrollToProgress(page, 0.36);
    await expect.poll(lit, { timeout: 15_000 }).not.toEqual([middle]);
    await scrollToProgress(page, 0.3);
    await expect.poll(lit, { timeout: 15_000 }).toEqual([middle]);
  });

  test("lays no backdrop over the scene behind the chapter text", async ({ page }) => {
    // Regression: a full-frame darkening layer once sat behind every
    // chapter, and slid in early with the next one as a hard-edged band.
    await expect(page.locator("#chapter-01 [data-flight-part='body']")).toBeHidden({
      timeout: 30_000,
    });
    await scrollToProgress(page, 0.18);
    await expect(page.locator("[data-hud='percent']")).toHaveText("018", { timeout: 15_000 });
    const backdrops = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".chapter-panel")).map((panel) => {
        const before = getComputedStyle(panel, "::before");
        return before.content === "none" ? "none" : before.backgroundImage;
      }),
    );
    expect(backdrops.every((value) => value === "none")).toBe(true);
  });

  test("opens a milestone to show its detail", async ({ page }) => {
    await expect(page.locator("#chapter-01 [data-flight-part='body']")).toBeHidden({
      timeout: 30_000,
    });
    await scrollToProgress(page, 0.92);
    // Let the scrub settle: the current strip changes while it catches up.
    await expect(page.locator("[data-hud='percent']")).toHaveText("092", { timeout: 15_000 });
    const chapter = page.locator("#chapter-06");
    await expect(chapter.locator("[data-flight-part='body']")).toBeVisible({ timeout: 15_000 });
    // Whichever strip is showing (on small screens only the current one is).
    const toggle = chapter.locator("[data-milestone-toggle]:visible").first();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const detail = page.locator(`#${await toggle.getAttribute("aria-controls")}`);
    await expect(detail).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(detail).toBeVisible();
    await toggle.click();
    await expect(detail).toBeHidden();
  });

  test("Begin the journey glides through the takeoff into chapter 1", async ({ page }) => {
    await expect(page.locator("#chapter-01 [data-flight-part='body']")).toBeHidden({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: "Begin the journey" }).click();
    // A glide, not a cut: the veil stays down and progress passes through the roll.
    await expect(page.locator(".flight-veil")).not.toHaveAttribute("data-on", "true");
    await expect(page.locator("[data-hud='chapter-count']")).toHaveText("01 / 06", {
      timeout: 15_000,
    });
    await expect(page.locator("#chapter-01 [data-flight-part='body']")).toBeVisible();
    await expect(page).toHaveURL(/#chapter-01$/);
  });

  test("flies to a chapter from the HUD", async ({ page }) => {
    await expect(page.locator("#chapter-01 [data-flight-part='body']")).toBeHidden({
      timeout: 30_000,
    });
    const link = page.locator("[data-hud-segment='4']");
    test.skip(!(await link.isVisible()), "The chapter rail is not shown at this size");
    await link.click();
    await expect(page.locator("[data-hud='chapter-count']")).toHaveText("04 / 06", {
      timeout: 15_000,
    });
    await expect(page.locator("#chapter-04 [data-flight-part='body']")).toBeVisible();
    await expect(page).toHaveURL(/#chapter-04$/);
  });

  test("still reaches the portfolio below the flight", async ({ page }) => {
    await page.getByRole("link", { name: "Skip to portfolio" }).click();
    await expect(page).toHaveURL(/#about$/);
    await expect(page.locator("#about")).toBeInViewport();
  });
});
