import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("hashPassword", () => {
  it("produces an Argon2id PHC string that does not contain the password", async () => {
    const passwordHash = await hashPassword("Secret12345");

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(passwordHash).not.toContain("Secret12345");
  });

  it("salts every hash", async () => {
    expect(await hashPassword("Secret12345")).not.toBe(await hashPassword("Secret12345"));
  });
});

describe("verifyPassword", () => {
  it("accepts the original password and rejects any other", async () => {
    const passwordHash = await hashPassword("Secret12345");

    expect(await verifyPassword(passwordHash, "Secret12345")).toBe(true);
    expect(await verifyPassword(passwordHash, "secret12345")).toBe(false);
  });
});
