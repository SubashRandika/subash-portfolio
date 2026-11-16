import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLIGHT_MODE_SCRIPT } from "./flight-mode-script";

/** Runs the head script as the browser would, and returns the chosen mode. */
function choose(): string | undefined {
  new Function(FLIGHT_MODE_SCRIPT)();
  return document.documentElement.dataset.flight;
}

const loseContext = vi.fn();
const acceleratedContext = { getExtension: () => ({ loseContext }) };

beforeEach(() => {
  vi.stubGlobal("WebGL2RenderingContext", function WebGL2RenderingContext() {});
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
  window.history.replaceState(null, "", "/");
  loseContext.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.flight;
});

describe("flight mode, chosen before first paint", () => {
  it("flies live with hardware-accelerated WebGL 2, and releases the probe context", () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(acceleratedContext as unknown as RenderingContext);
    expect(choose()).toBe("live");
    expect(getContext).toHaveBeenCalledWith("webgl2", { failIfMajorPerformanceCaveat: true });
    expect(loseContext).toHaveBeenCalled();
  });

  it("stays static when WebGL would run on the CPU", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(choose()).toBe("static");
  });

  it("stays static without WebGL 2", () => {
    vi.stubGlobal("WebGL2RenderingContext", undefined);
    expect(choose()).toBe("static");
  });

  it("stays static for visitors who ask for reduced motion", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      acceleratedContext as unknown as RenderingContext,
    );
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(choose()).toBe("static");
  });

  it("can be forced either way for testing, without probing", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    window.history.replaceState(null, "", "/?flight=live");
    expect(choose()).toBe("live");
    expect(getContext).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/?flight=static");
    expect(choose()).toBe("static");
  });
});
