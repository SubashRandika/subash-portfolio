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
    await expect(
      page.getByText("Every journey begins with a takeoff."),
    ).toBeVisible();
    await expect(page.getByText("Mine began in 2013.")).toBeVisible();
  });

  test("exposes the main landmarks", async ({ page }) => {
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("renders all six chapters and the portfolio sections as HTML", async ({
    page,
  }) => {
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
      "open-source",
      "experience",
      "recommendations",
      "contact",
    ]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    await expect(
      page.getByRole("heading", { name: "Engineering at Scale" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: /Work experience/ }),
    ).toBeAttached();
  });

  test("does not start WebGL", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("data-flight", "static");
    await expect(page.locator(".flight-canvas canvas")).toHaveCount(0);
    // Every milestone is readable without scrolling through a flight.
    await expect(
      page
        .locator("#chapter-01")
        .getByText("Close to 200 WSO2 ESB cloud connectors."),
    ).toBeVisible();
  });

  test("every in-page link points at an element that exists", async ({
    page,
  }) => {
    const hrefs = await page
      .locator('a[href^="#"]')
      .evaluateAll((links) =>
        [...new Set(links.map((a) => a.getAttribute("href") ?? ""))].filter(
          (h) => h.length > 1,
        ),
      );
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      if (href === "#top") continue; // resolved by the browser itself
      await expect(page.locator(href), `target of ${href}`).toHaveCount(1);
    }
  });

  test("skip link is the first stop and moves focus to the content", async ({
    page,
  }) => {
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("does not scroll horizontally", async ({ page }) => {
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("primary navigation reaches every section", async ({ page }) => {
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    if (!wide) {
      const toggle = page.getByRole("button", { name: "Open menu" });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(
        page.getByRole("button", { name: "Close menu" }),
      ).toHaveAttribute("aria-expanded", "true");
    }
    const nav = page
      .getByRole("navigation", { name: "Primary" })
      .filter({ visible: true });
    await expect(nav.getByRole("link")).toHaveText([
      "Home",
      "Projects",
      "Experience",
      "Recommendations",
      "Education",
      "About",
      "Contact",
    ]);
    await nav.getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(page.locator("#contact")).toBeInViewport();
    if (!wide) {
      // Choosing a destination closes the menu.
      await expect(
        page.getByRole("button", { name: "Open menu" }),
      ).toBeVisible();
    }
  });

  test("offers every way to get in touch", async ({ page }) => {
    const contact = page.locator("#contact");
    await expect(contact.getByRole("link", { name: /Email/ })).toHaveAttribute(
      "href",
      "mailto:subash.rodrigo@gmail.com",
    );
    for (const [name, href] of [
      [
        /LinkedIn.*opens in a new tab/,
        "https://www.linkedin.com/in/subash-rodrigo/",
      ],
      [/GitHub.*opens in a new tab/, "https://github.com/SubashRandika"],
    ] as const) {
      const link = contact.getByRole("link", { name });
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    const resume = contact.getByRole("link", { name: /Résumé/ });
    await expect(resume).toHaveAttribute("href", "/resume.pdf");
    await expect(resume).toHaveAttribute(
      "download",
      "Subash-Rodrigo-Resume.pdf",
    );
    // The opening offers the same file, with its length and size.
    const hero = page
      .locator("#takeoff")
      .getByRole("link", { name: /Download résumé, PDF, \d+ pages?, \d+ KB/ });
    await expect(hero).toHaveAttribute("href", "/resume.pdf");
    await expect(hero).toHaveAttribute("download", "Subash-Rodrigo-Resume.pdf");
    const pdf = await page.request.get("/resume.pdf");
    expect(pdf.ok()).toBe(true);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");

    const footer = page.getByRole("navigation", {
      name: "Contact and profiles",
    });
    await expect(footer.getByRole("link")).toHaveText([
      /Email/,
      /LinkedIn/,
      /GitHub/,
      /Résumé/,
    ]);
  });

  test("shows education", async ({ page }) => {
    const education = page.locator("#education");
    await expect(education).toContainText(
      "Bachelor of Science in Computer Science (Special)",
    );
    await expect(education).toContainText("University of Kelaniya, Sri Lanka");
  });

  test("shows the technologies as a table, with icons and a family filter", async ({
    page,
  }) => {
    const table = page.locator(".tech-table");
    await expect(table).toHaveAttribute("data-reveal", "pending");
    await page.locator("#expertise").scrollIntoViewIfNeeded();
    await expect(table).toHaveAttribute("data-reveal", "shown");

    const tiles = page
      .getByRole("list", { name: "Technologies" })
      .getByRole("listitem");
    await expect(tiles).toHaveCount(60);
    await expect(tiles.filter({ hasText: "TypeScript" })).toHaveAttribute(
      "data-core",
      "true",
    );
    // Every icon loads. Alone this takes under a second; the longer timeout
    // covers a full parallel run, where the test browsers share the CPU.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              [
                ...document.querySelectorAll<HTMLImageElement>("img.tech-icon"),
              ].filter((img) => !(img.complete && img.naturalWidth > 0)).length,
          ),
        { timeout: 15_000 },
      )
      .toBe(0);

    // The legend filters by family, from the keyboard too.
    const frontend = page.getByRole("button", { name: /^Frontend/ });
    await frontend.focus();
    await page.keyboard.press("Enter");
    await expect(frontend).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".tech-tile[data-dimmed]")).toHaveCount(60 - 13);
    await expect(
      tiles.filter({ hasText: "React" }).first(),
    ).not.toHaveAttribute("data-dimmed", "true");
    // Pressing it again shows everything.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /^All/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".tech-tile[data-dimmed]")).toHaveCount(0);
  });

  test("reveals the portrait in About when it scrolls into view", async ({
    page,
  }) => {
    const portrait = page.locator(".portrait");
    // Held back while it is far below the fold...
    await expect(portrait).toHaveAttribute("data-reveal", "pending");
    await page.locator("#about").scrollIntoViewIfNeeded();
    // ...and shown once it arrives.
    await expect(portrait).toHaveAttribute("data-reveal", "shown");
    const image = page.getByRole("img", {
      name: "Subash Rodrigo, Lead Software Engineer",
    });
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((img: HTMLImageElement) =>
          img.complete ? img.naturalWidth : 0,
        ),
      )
      .toBeGreaterThan(0);

    // Regression: the orbit and corner marks once reached past the column
    // and were cut off. Every part stays inside the figure, and the figure
    // inside the page.
    const overhang = await portrait.evaluate((figure) => {
      const box = figure.getBoundingClientRect();
      const parts = figure.querySelectorAll(
        ".portrait-orbit, .portrait-corner",
      );
      let worst = 0;
      for (const part of parts) {
        const r = part.getBoundingClientRect();
        worst = Math.max(worst, box.left - r.left, r.right - box.right);
      }
      return {
        worst,
        pageRight: document.documentElement.clientWidth - box.right,
      };
    });
    expect(overhang.worst).toBeLessThanOrEqual(1);
    expect(overhang.pageRight).toBeGreaterThanOrEqual(0);
  });

  test("shows the LinkedIn recommendations as a carousel the visitor can drive", async ({
    page,
  }) => {
    const section = page.locator("#recommendations");
    await section.scrollIntoViewIfNeeded();
    const carousel = section.getByRole("region", {
      name: "Recommendations from LinkedIn",
    });
    await expect(carousel.locator(".rec-slide")).toHaveCount(9);
    // Three in view: the focused one in the centre, its neighbours either side.
    await expect(carousel.locator(".rec-slide[data-active]")).toHaveCount(1);
    await expect(
      carousel.locator('.rec-slide:is([data-offset="-1"], [data-offset="1"])'),
    ).toHaveCount(2);
    const current = carousel.locator(".rec-dot[aria-current=true]");
    await expect(current).toHaveAttribute(
      "aria-label",
      "Recommendation 1: Clyde Casiechitty",
    );

    // Pause first, so the automatic rotation does not race the test.
    await carousel
      .getByRole("button", { name: "Pause automatic rotation" })
      .click();
    await carousel.getByRole("button", { name: "Next recommendation" }).click();
    await expect(current).toHaveAttribute(
      "aria-label",
      "Recommendation 2: Rasika Hettige",
    );
    await carousel
      .getByRole("button", { name: "Recommendation 6: Darshana Ratalakotuwa" })
      .click();
    await expect(current).toHaveAttribute(
      "aria-label",
      "Recommendation 6: Darshana Ratalakotuwa",
    );

    // The full text opens in a reading panel; the cards keep their size.
    const heights = () =>
      // Layout height, unaffected by the cards' scale as they move.
      carousel
        .locator(".rec-card")
        .evaluateAll((cards) =>
          cards.map((card) => (card as HTMLElement).offsetHeight),
        );
    const before = await heights();
    const slide = carousel.getByRole("group", {
      name: "6 of 9: Darshana Ratalakotuwa",
    });
    await slide
      .getByRole("button", { name: "Read the full recommendation" })
      .click();
    const reader = page.getByRole("dialog", { name: "Darshana Ratalakotuwa" });
    await expect(
      reader.getByText(/migrating our on-premises application/),
    ).toBeVisible();
    expect(await heights()).toEqual(before);
    // Next reads on without closing; the carousel follows.
    await reader.getByRole("button", { name: "Next: Samudi Hansani" }).click();
    await expect(
      page.getByRole("dialog", { name: "Samudi Hansani" }),
    ).toBeVisible();
    await expect(current).toHaveAttribute(
      "aria-label",
      "Recommendation 7: Samudi Hansani",
    );
    // Esc closes it and focus returns to the card now in the centre.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      carousel
        .getByRole("group", { name: "7 of 9: Samudi Hansani" })
        .getByRole("button", {
          name: "Read the full recommendation",
        }),
    ).toBeFocused();

    // Only the row of cards scrolls; the page does not.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await expect(
      section.getByRole("link", { name: /All recommendations on LinkedIn/ }),
    ).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/subash-rodrigo/details/recommendations/",
    );
  });

  test("shows the personal projects as cards that open their live demos", async ({
    page,
  }) => {
    const section = page.locator("#open-source");
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator(".oss-grid")).toHaveAttribute(
      "data-reveal",
      "shown",
    );
    const cards = section.getByRole("article");
    await expect(cards).toHaveCount(6);

    const demo = section.getByRole("link", {
      name: "DreamHaus, live demo (opens in a new tab)",
    });
    await expect(demo).toHaveAttribute("href", "https://dream-haus.vercel.app");
    await expect(demo).toHaveAttribute("target", "_blank");
    await expect(
      section.getByRole("link", {
        name: "Source of DreamHaus on GitHub (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "https://github.com/SubashRandika/dream-haus");

    // Every screenshot loads.
    for (const image of await section.locator(".oss-shot").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate((img: HTMLImageElement) =>
            img.complete ? img.naturalWidth : 0,
          ),
        )
        .toBeGreaterThan(0);
    }

    // A click anywhere on the card, not only on its title, opens the demo;
    // the source link above it opens the repository instead.
    const card = cards.nth(2);
    await card.scrollIntoViewIfNeeded();
    const box = await card.locator(".oss-screen").boundingBox();
    expect(box).not.toBeNull();
    const topmost = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x!, y!)?.closest("a")?.getAttribute("href") ??
        null,
      [box!.x + box!.width / 2, box!.y + box!.height / 2],
    );
    expect(topmost).toBe("https://dream-haus.vercel.app");
    const source = card.getByRole("link", { name: /^Source of DreamHaus/ });
    const sourceBox = await source.boundingBox();
    const onSource = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x!, y!)?.closest("a")?.getAttribute("href") ??
        null,
      [
        sourceBox!.x + sourceBox!.width / 2,
        sourceBox!.y + sourceBox!.height / 2,
      ],
    );
    expect(onSource).toBe("https://github.com/SubashRandika/dream-haus");
  });
});

test.describe("reduced motion", () => {
  test("visitors who ask for reduced motion get the static experience", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-flight", "static");
    await expect(page.locator(".flight-canvas canvas")).toHaveCount(0);
    // The portrait is simply there, with no entrance to wait for.
    await expect(page.locator(".portrait")).toHaveAttribute(
      "data-reveal",
      "shown",
    );
  });
});

test.describe("light and dark mode", () => {
  test("follows the system, switches from the header and remembers the choice", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/?flight=static");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-mode", "dark");

    const toggle = page.getByRole("switch", { name: "Dark mode" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    // Fully on screen next to the navigation at every width.
    const box = await toggle.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    const documentsBackground = () =>
      page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".documents")!)
            .backgroundColor,
      );
    expect(await documentsBackground()).toBe("rgb(12, 21, 38)");

    await toggle.click();
    await expect(html).toHaveAttribute("data-mode", "light");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect.poll(documentsBackground).toBe("rgb(238, 242, 246)");

    // The choice outlasts a reload even though the system still says dark.
    await page.reload();
    await expect(html).toHaveAttribute("data-mode", "light");
  });
});
