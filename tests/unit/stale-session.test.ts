import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as clearSession } from "@/app/api/auth/clear-session/route";
import { CLEAR_SESSION_PATH, HOME_PATH, LOGIN_PATH } from "@/lib/auth/constants";
import { requireActionSession, requireUser } from "@/lib/auth/current-user";
import {
  deleteSessionCookie,
  readSessionCookie,
  validateSession,
  type ValidatedSession,
} from "@/lib/auth/session";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  readSessionCookie: vi.fn(),
  validateSession: vi.fn(),
  deleteSessionCookie: vi.fn(),
}));

const liveSession: ValidatedSession = {
  session: { id: "session-1", expiresAt: new Date("2026-01-01T12:00:00Z") },
  user: { id: "user-1", login: "ivanov", fullName: "Ivan Ivanov", role: "EMPLOYEE" },
};

function givenCookie(token: string | null, session: ValidatedSession | null = null) {
  vi.mocked(readSessionCookie).mockResolvedValue(token);
  vi.mocked(validateSession).mockResolvedValue(session);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireUser", () => {
  it("returns the user of a live session", async () => {
    givenCookie("token", liveSession);

    await expect(requireUser()).resolves.toEqual(liveSession.user);
    expect(deleteSessionCookie).not.toHaveBeenCalled();
  });

  it("sends a cookie without a live session to the route handler that removes it", async () => {
    givenCookie("revoked-token");

    await expect(requireUser()).rejects.toThrow(`redirect:${CLEAR_SESSION_PATH}`);
  });

  it("sends a visitor without a cookie straight to the login page", async () => {
    givenCookie(null);

    await expect(requireUser()).rejects.toThrow(`redirect:${LOGIN_PATH}`);
  });
});

describe("requireActionSession", () => {
  it("returns a live session with its user", async () => {
    givenCookie("token", liveSession);

    await expect(requireActionSession()).resolves.toEqual(liveSession);
    expect(deleteSessionCookie).not.toHaveBeenCalled();
  });

  it("removes a cookie without a live session itself before redirecting to login", async () => {
    givenCookie("revoked-token");

    await expect(requireActionSession()).rejects.toThrow(`redirect:${LOGIN_PATH}`);
    expect(deleteSessionCookie).toHaveBeenCalledOnce();
  });
});

describe("clear-session route handler", () => {
  it("removes the cookie of a revoked session and redirects to login", async () => {
    givenCookie("revoked-token");

    await expect(clearSession()).rejects.toThrow(`redirect:${LOGIN_PATH}`);
    expect(deleteSessionCookie).toHaveBeenCalledOnce();
  });

  it("keeps a live session and redirects home", async () => {
    givenCookie("token", liveSession);

    await expect(clearSession()).rejects.toThrow(`redirect:${HOME_PATH}`);
    expect(deleteSessionCookie).not.toHaveBeenCalled();
  });

  it("does not query sessions without a cookie", async () => {
    givenCookie(null);

    await expect(clearSession()).rejects.toThrow(`redirect:${LOGIN_PATH}`);
    expect(validateSession).not.toHaveBeenCalled();
  });
});
