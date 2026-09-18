import { getRequestConfig } from "next-intl/server";

import { DISPLAY_TIME_ZONE } from "@/lib/format";

// Single locale without /ru/... routes; switching appears with the second locale (stage 10).
export const DEFAULT_LOCALE = "ru";

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;

  return {
    locale,
    timeZone: DISPLAY_TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
