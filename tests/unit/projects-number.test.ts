import { describe, expect, it } from "vitest";

import { nextProjectNumber } from "@/features/projects/number";

describe("nextProjectNumber", () => {
  it("starts the year at 001", () => {
    expect(nextProjectNumber([], 2026)).toBe("2026-001");
  });

  it("continues after the highest number of the year", () => {
    expect(nextProjectNumber(["2026-001", "2026-009", "2026-002"], 2026)).toBe("2026-010");
  });

  it("keeps growing past three digits", () => {
    expect(nextProjectNumber(["2026-999"], 2026)).toBe("2026-1000");
    expect(nextProjectNumber(["2026-1000"], 2026)).toBe("2026-1001");
  });

  it("ignores other years and other shapes of number", () => {
    expect(nextProjectNumber(["2025-120", "Baarn-7", "2026/003", "26-004", "2026-"], 2026)).toBe(
      "2026-001",
    );
  });
});
