import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { signIn, signOut } from "@/features/auth/actions";
import { HOME_PATH, LOGIN_PATH } from "@/lib/auth/constants";
import { db } from "@/lib/db";

import { auditEntries, auditLogText, createUser, PASSWORD } from "./helpers";
import { request, TEST_IP } from "./request";
import { t } from "./translations";

const invalidCredentials = { ok: false, error: "auth.errors.invalidCredentials" };
const WRONG_PASSWORD = "Wrong2026pass";

/** Runs a server action that ends with a redirect and returns where it leads. */
async function redirectOf(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
      return digest.split(";")[2];
    }
    throw error;
  }
  throw new Error("The action did not redirect");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("signing in", () => {
  it("opens a session with the password and stores only a hash of its token", async () => {
    const user = await createUser({ login: "ivanov" });

    await expect(redirectOf(() => signIn({ login: " Ivanov ", password: PASSWORD }))).resolves.toBe(
      HOME_PATH,
    );

    const token = request.sessionToken;
    expect(token).toEqual(expect.any(String));
    const [session] = await db.session.findMany({ where: { userId: user.id } });
    expect(session).toMatchObject({ tokenHash: sha256(token!), ip: TEST_IP, revokedAt: null });
    expect(session.tokenHash).not.toBe(token);
    expect(await db.user.findUnique({ where: { id: user.id } })).toMatchObject({
      failedLoginCount: 0,
      lastLoginAt: expect.any(Date),
    });
    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "LOGIN",
        actorId: user.id,
        actorLogin: "ivanov",
        entity: "Session",
        entityId: session.id,
      }),
    ]);
  });

  it("gives one answer for an unknown login, a wrong password and a deactivated account", async () => {
    await createUser({ login: "ivanov" });
    await createUser({ login: "former", isActive: false });

    await expect(signIn({ login: "nobody", password: PASSWORD })).resolves.toEqual(
      invalidCredentials,
    );
    await expect(signIn({ login: "ivanov", password: WRONG_PASSWORD })).resolves.toEqual(
      invalidCredentials,
    );
    await expect(signIn({ login: "former", password: PASSWORD })).resolves.toEqual(
      invalidCredentials,
    );
    expect(request.sessionToken).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it("logs a failed attempt with the login and the IP address, but not the password", async () => {
    await createUser({ login: "ivanov" });

    await signIn({ login: "Nobody", password: WRONG_PASSWORD });
    await signIn({ login: "ivanov", password: WRONG_PASSWORD });

    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "LOGIN_FAILED",
        actorId: null,
        actorLogin: "nobody",
        summary: t("audit.summaries.loginFailedUnknown"),
        ip: TEST_IP,
      }),
      expect.objectContaining({
        action: "LOGIN_FAILED",
        actorId: null,
        actorLogin: "ivanov",
        entityId: null,
        summary: t("audit.summaries.loginFailedPassword"),
        ip: TEST_IP,
      }),
    ]);
    expect(await auditLogText()).not.toContain(WRONG_PASSWORD);
  });

  it("locks the account for 15 minutes after five failed attempts in a row", async () => {
    const user = await createUser({ login: "ivanov" });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(signIn({ login: "ivanov", password: WRONG_PASSWORD })).resolves.toEqual(
        invalidCredentials,
      );
    }
    const lockedAt = Date.now();

    await expect(signIn({ login: "ivanov", password: PASSWORD })).resolves.toEqual({
      ok: false,
      error: "auth.errors.temporarilyLocked",
      errorValues: { minutes: 15 },
    });
    expect(request.sessionToken).toBeNull();
    const { lockedUntil } = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(lockedUntil!.getTime() - lockedAt).toBeGreaterThan(14 * 60_000);
    expect(lockedUntil!.getTime() - lockedAt).toBeLessThanOrEqual(15 * 60_000);
  });

  it("lets the user in once the lock has expired", async () => {
    const user = await createUser({ login: "ivanov" });
    await db.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    await expect(redirectOf(() => signIn({ login: "ivanov", password: PASSWORD }))).resolves.toBe(
      HOME_PATH,
    );
    expect(await db.user.findUnique({ where: { id: user.id } })).toMatchObject({
      lockedUntil: null,
    });
  });

  it("counts failed attempts again after a successful sign-in", async () => {
    const user = await createUser({ login: "ivanov" });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await signIn({ login: "ivanov", password: WRONG_PASSWORD });
    }
    await redirectOf(() => signIn({ login: "ivanov", password: PASSWORD }));
    await signIn({ login: "ivanov", password: WRONG_PASSWORD });

    expect(await db.user.findUnique({ where: { id: user.id } })).toMatchObject({
      failedLoginCount: 1,
      lockedUntil: null,
    });
  });
});

describe("signing out", () => {
  it("ends the session, removes the cookie and is logged", async () => {
    const user = await createUser({ login: "ivanov" });
    await redirectOf(() => signIn({ login: "ivanov", password: PASSWORD }));

    await expect(redirectOf(signOut)).resolves.toBe(LOGIN_PATH);

    expect(request.sessionToken).toBeNull();
    const [session] = await db.session.findMany({ where: { userId: user.id } });
    expect(session.revokedAt).toEqual(expect.any(Date));
    expect((await auditEntries()).map((entry) => entry.action)).toEqual(["LOGIN", "LOGOUT"]);
  });
});
