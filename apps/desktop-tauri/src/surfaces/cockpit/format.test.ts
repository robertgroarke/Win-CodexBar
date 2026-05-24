import { describe, expect, it } from "vitest";
import {
  appendHistory,
  clampPercent,
  formatBytes,
  formatFrequency,
  formatPercent,
  formatRate,
} from "./format";

describe("cockpit formatting", () => {
  it("clamps and formats percentages", () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(42.4)).toBe(42.4);
    expect(clampPercent(101)).toBe(100);
    expect(formatPercent(41.6)).toBe("42%");
    expect(formatPercent(Number.NaN)).toBe("0%");
  });

  it("formats byte sizes and rates", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatRate(1024)).toBe("1 KB/s");
  });

  it("formats CPU frequency", () => {
    expect(formatFrequency(null)).toBe("n/a");
    expect(formatFrequency(850)).toBe("850 MHz");
    expect(formatFrequency(4740)).toBe("4.74 GHz");
  });

  it("keeps sparkline history bounded", () => {
    expect(appendHistory([1, 2], 3, 3)).toEqual([1, 2, 3]);
    expect(appendHistory([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    expect(appendHistory([1], Number.NaN, 3)).toEqual([1, 0]);
  });
});
