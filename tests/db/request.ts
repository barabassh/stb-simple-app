import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export const TEST_IP = "10.0.0.1";
export const TEST_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** What the browser sends with the request an action or a query runs for. */
export const request = {
  sessionToken: null as string | null,
  ip: TEST_IP,
  userAgent: TEST_USER_AGENT,
};

export function resetRequest(): void {
  Object.assign(request, { sessionToken: null, ip: TEST_IP, userAgent: TEST_USER_AGENT });
}

/** Stands in for `next/headers`, which works only inside a request handled by Next.js. */
export const nextHeaders = {
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && request.sessionToken
        ? { name, value: request.sessionToken }
        : undefined,
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (name !== SESSION_COOKIE_NAME) return;
      request.sessionToken = options?.maxAge === 0 ? null : value;
    },
  }),
  headers: async () =>
    new Headers({ "user-agent": request.userAgent, "x-forwarded-for": request.ip }),
};
