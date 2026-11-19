import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

/** WCAG 2.0, 2.1 and 2.2 at levels A and AA: the target in the brief. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  // A readable summary in the failure message: rule, impact and where.
  return results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`,
  );
}

test.describe("accessibility (WCAG 2.2 AA, automated checks)", () => {
  test("the static page has no violations", async ({ page }) => {
    await page.goto("/?flight=static");
    // Let the opening's entrance settle (its words start blurred and faint);
    // the scroll cue's short loop is decoration and is not waited for.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && target.closest("#takeoff") && !target.closest(".hero-hint");
        })
        .every((animation) => animation.playState !== "running"),
    );
    // Reveal the portrait so it is audited as a visitor sees it.
    await page.locator("#about").scrollIntoViewIfNeeded();
    await expect(page.locator(".portrait")).toHaveAttribute("data-reveal", "shown");
    // ...and the technology table, once its cascade has finished.
    await page.locator("#expertise").scrollIntoViewIfNeeded();
    await expect(page.locator(".tech-table")).toHaveAttribute("data-reveal", "shown");
    // (Only the table's own animations: the portrait's orbit turns forever.)
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && target.closest(".tech-table");
        })
        .every((animation) => animation.playState !== "running"),
    );
    expect(await audit(page)).toEqual([]);
  });

  test("the open mobile menu has no violations", async ({ page }) => {
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    test.skip(wide, "The menu is inline on wide screens.");
    await page.goto("/?flight=static");
    await page.getByRole("button", { name: "Open menu" }).click();
    expect(await audit(page)).toEqual([]);
  });
});
