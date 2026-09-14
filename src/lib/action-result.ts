/**
 * Expected failure of a server action (docs/АРХИТЕКТУРА.md, 3.3).
 * `error` and every field message are translation keys, not display text.
 */
export type ActionFailure = {
  ok: false;
  error?: string;
  errorValues?: Record<string, string | number>;
  fieldErrors?: Record<string, string[] | undefined>;
};
