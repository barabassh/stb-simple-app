import { redirect } from "next/navigation";

import { HOME_PATH, LOGIN_PATH } from "@/lib/auth/constants";
import { deleteSessionCookie, readSessionCookie, validateSession } from "@/lib/auth/session";

export async function GET() {
  const token = await readSessionCookie();
  // SameSite=Lax sends the cookie on cross-site navigation: a plain link must not end a live session.
  if (token && (await validateSession(token))) redirect(HOME_PATH);

  await deleteSessionCookie();
  redirect(LOGIN_PATH);
}
