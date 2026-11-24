import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLIGHT_MODE_SCRIPT } from "./flight-mode-script";

/** Runs the head script as the browser would, and returns the chosen mode. */
function choose(): string | undefined {
  new Function(FLIGHT_MODE_SCRIPT)();
  return document.documentElement.dataset.flight;
}

function stubConnection(connection: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, "connection", {
    value: connection,
    configurable: true,
  });
}

let canPlayType: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
  }));
  canPlayType = vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  stubConnection({ saveData: false, effectiveType: "4g" });
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  stubConnection(undefined);
  delete document.documentElement.dataset.flight;
});

describe("flight mode, chosen before first paint", () => {
  it("plays the film live in a browser that plays H.264", () => {
    expect(choose()).toBe("live");
    expect(canPlayType).toHaveBeenCalledWith('video/mp4; codecs="avc1.640028"');
  });

  it("flies live without the Network Information API", () => {
    stubConnection(undefined);
    expect(choose()).toBe("live");
  });

  it("stays static when the browser cannot play the film", () => {
    canPlayType.mockReturnValue("");
    expect(choose()).toBe("static");
  });

  it("stays static for visitors who ask for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(choose()).toBe("static");
  });

  it("stays static in data-saver mode", () => {
    stubConnection({ saveData: true, effectiveType: "4g" });
    expect(choose()).toBe("static");
  });

  it.each(["2g", "slow-2g"])("stays static on a %s connection", (effectiveType) => {
    stubConnection({ saveData: false, effectiveType });
    expect(choose()).toBe("static");
  });

  it("still flies on a 3G connection; the film loads clip by clip", () => {
    stubConnection({ saveData: false, effectiveType: "3g" });
    expect(choose()).toBe("live");
  });

  it("can be forced either way for testing", () => {
    canPlayType.mockReturnValue("");
    window.history.replaceState(null, "", "/?flight=live");
    expect(choose()).toBe("live");
    canPlayType.mockReturnValue("probably");
    window.history.replaceState(null, "", "/?flight=static");
    expect(choose()).toBe("static");
  });
});
