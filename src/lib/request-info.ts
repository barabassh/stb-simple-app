import { headers } from "next/headers";

export type ClientInfo = { ip: string | null; userAgent: string | null };

export async function getClientInfo(): Promise<ClientInfo> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();

  return {
    ip: forwardedFor || requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  };
}
