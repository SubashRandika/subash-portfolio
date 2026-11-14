import { describe, expect, it } from "vitest";
import { LOCAL_FALLBACK_ORIGIN, resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("falls back to localhost and reports unconfigured when unset", () => {
    for (const raw of [undefined, "", "   "]) {
      const result = resolveSiteUrl(raw);
      expect(result.origin).toBe(LOCAL_FALLBACK_ORIGIN);
      expect(result.isConfigured).toBe(false);
      expect(result.problem).toMatch(/not set/);
    }
  });

  it("accepts a bare https origin and strips the trailing slash", () => {
    const result = resolveSiteUrl("https://www.example.com/");
    expect(result).toEqual({
      origin: "https://www.example.com",
      isConfigured: true,
      problem: undefined,
    });
  });

  it("rejects non-https origins for real hosts", () => {
    const result = resolveSiteUrl("http://www.example.com");
    expect(result.isConfigured).toBe(false);
    expect(result.problem).toMatch(/https/);
  });

  it("rejects values with a path, query or hash", () => {
    for (const raw of [
      "https://www.example.com/portfolio",
      "https://www.example.com/?a=1",
      "https://www.example.com/#top",
    ]) {
      expect(resolveSiteUrl(raw).isConfigured).toBe(false);
    }
  });

  it("rejects values that are not URLs", () => {
    const result = resolveSiteUrl("www.example.com");
    expect(result.isConfigured).toBe(false);
    expect(result.problem).toMatch(/valid absolute URL/);
  });

  it("allows localhost for previews but never treats it as deployable", () => {
    const result = resolveSiteUrl("http://127.0.0.1:3100");
    expect(result.origin).toBe("http://127.0.0.1:3100");
    expect(result.isConfigured).toBe(false);
  });
});
