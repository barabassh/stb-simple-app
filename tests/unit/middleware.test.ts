import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { CLEAR_SESSION_PATH, LOGIN_PATH, SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { middleware } from "@/middleware";

function request(path: string, token?: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("middleware", () => {
  it("redirects a visitor without a session cookie to login", () => {
    const response = middleware(request("/users"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe(LOGIN_PATH);
  });

  it("renews the session cookie on a GET request", () => {
    const response = middleware(request("/users", "token"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("token");
  });

  it("does not renew the cookie on the route that deletes it", () => {
    const response = middleware(request(CLEAR_SESSION_PATH, "revoked-token"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
