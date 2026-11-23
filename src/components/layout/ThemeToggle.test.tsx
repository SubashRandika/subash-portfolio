import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { COLOR_MODE_KEY, COLOR_MODE_SCRIPT } from "@/lib/color-mode";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  delete document.documentElement.dataset.mode;
  window.localStorage.clear();
});

describe("ThemeToggle", () => {
  it("is a switch named Dark mode that reflects the current mode", () => {
    document.documentElement.dataset.mode = "dark";
    render(<ThemeToggle />);
    expect(screen.getByRole("switch", { name: "Dark mode" })).toHaveAttribute("aria-checked", "true");
  });

  it("switches the mode and remembers the choice", () => {
    document.documentElement.dataset.mode = "light";
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: "Dark mode" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(window.localStorage.getItem(COLOR_MODE_KEY)).toBe("dark");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.mode).toBe("light");
    expect(window.localStorage.getItem(COLOR_MODE_KEY)).toBe("light");
  });

  it("follows changes made elsewhere", async () => {
    document.documentElement.dataset.mode = "light";
    render(<ThemeToggle />);
    await act(async () => {
      document.documentElement.dataset.mode = "dark";
      // Let the MutationObserver report the change.
      await Promise.resolve();
    });
    expect(screen.getByRole("switch", { name: "Dark mode" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("COLOR_MODE_SCRIPT", () => {
  it("applies a remembered choice before the page paints", () => {
    window.localStorage.setItem(COLOR_MODE_KEY, "dark");
    new Function(COLOR_MODE_SCRIPT)();
    expect(document.documentElement.dataset.mode).toBe("dark");
  });

  it("falls back to light without a choice or system preference", () => {
    new Function(COLOR_MODE_SCRIPT)();
    expect(document.documentElement.dataset.mode).toBe("light");
  });
});
