/**
 * Expected failure of a server action (docs/АРХИТЕКТУРА.md, 3.3).
 * `error` and every field message are translation keys, not display text.
 */
export type ActionFailure = {
  ok: false;
  error?: string;
  /** Values of the placeholders in `error` and in the field messages. */
  errorValues?: Record<string, string | number>;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type ActionResult<TData extends object = object> = ({ ok: true } & TData) | ActionFailure;
