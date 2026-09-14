import { describe, expect, it } from "vitest";

import { can } from "@/lib/permissions";

describe("can", () => {
  it("expands a section wildcard to nested permissions", () => {
    expect(can({ role: "ADMIN" }, "users.sessions.revoke")).toBe(true);
    expect(can({ role: "CONTRACTOR" }, "profile.sessions")).toBe(true);
  });

  it("grants nothing beyond the listed permissions", () => {
    expect(can({ role: "MANAGER" }, "users.read")).toBe(true);
    expect(can({ role: "MANAGER" }, "users.create")).toBe(false);
    expect(can({ role: "MANAGER" }, "audit.read")).toBe(false);
    expect(can({ role: "EMPLOYEE" }, "users.read")).toBe(false);
  });
});
