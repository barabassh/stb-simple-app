import { createTranslator } from "next-intl";

import messages from "../../messages/ru.json";

/** Translates like the application does, so tests compare with the texts users see. */
export const t = createTranslator({ locale: "ru", messages });

/** Stands in for `next-intl/server`, whose request configuration exists only inside Next.js. */
export const nextIntlServer = {
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: "ru", messages, namespace: namespace as never }),
};
