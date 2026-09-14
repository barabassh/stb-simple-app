import { describe, expect, it } from "vitest";

import { loginSchema } from "@/features/auth/schemas";

describe("loginSchema", () => {
  it("normalizes the login to trimmed lower case", () => {
    expect(loginSchema.parse({ login: "  Ivanov ", password: "x" }).login).toBe("ivanov");
  });

  it("requires both fields", () => {
    const result = loginSchema.safeParse({ login: " ", password: "" });

    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["login", "auth.validation.loginRequired"],
      ["password", "auth.validation.passwordRequired"],
    ]);
  });
});
