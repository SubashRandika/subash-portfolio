import { describe, expect, it } from "vitest";
import { cn, formatDate, pad2 } from "./utils";

describe("cn", () => {
  it("joins truthy class names and skips the rest", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });
});

describe("formatDate", () => {
  it("formats ISO dates without locale-dependent APIs", () => {
    expect(formatDate("2013-06-17")).toBe("17 Jun 2013");
    expect(formatDate("2022-01-01")).toBe("1 Jan 2022");
    expect(formatDate("2021-12-31")).toBe("31 Dec 2021");
  });

  it("rejects anything that is not an ISO date", () => {
    expect(() => formatDate("17/06/2013")).toThrow(/ISO date/);
    expect(() => formatDate("2013-13-01")).toThrow(/Invalid month/);
  });
});

describe("pad2", () => {
  it("zero-pads to two digits", () => {
    expect(pad2(3)).toBe("03");
    expect(pad2(12)).toBe("12");
  });
});
