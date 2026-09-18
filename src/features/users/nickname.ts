// The nickname rule of docs/ТЗ.md, 7.4. The migration that added nicknames repeats the default
// rule in SQL for the users created before stage 4; the two must stay in step.

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 40;

const NICKNAME_CHARACTERS = /^[\p{L}\p{Nd} ._'’-]*$/u;

/** Trims the edges and collapses repeated spaces, as the form field does. */
export function normalizeNickname(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Letters, digits, space, dot, hyphen, underscore and apostrophe. */
export function hasNicknameCharacters(value: string): boolean {
  return NICKNAME_CHARACTERS.test(value);
}

export function isNicknameFormat(value: string): boolean {
  return (
    value.length >= NICKNAME_MIN_LENGTH &&
    value.length <= NICKNAME_MAX_LENGTH &&
    hasNicknameCharacters(value)
  );
}

/**
 * The plain candidates of a chain, then `base 2`, `base 3`, ... . The chain ends at the first
 * candidate that does not fit the format: a longer number would not fit either.
 */
function* chain(plain: string[], base: string): Generator<string> {
  for (let attempt = 1; ; attempt += 1) {
    const candidate =
      attempt <= plain.length ? plain[attempt - 1] : `${base} ${attempt - plain.length + 1}`;
    if (!isNicknameFormat(candidate)) return;
    yield candidate;
  }
}

/**
 * The default nicknames in the order they are tried. The full name is "Surname Name Patronymic":
 * the first name is its second word, or its only word. "Иванов Иван Иванович" gives "Иван",
 * "Иван И.", "Иван И. 2", ...; a single word "Иван" gives "Иван", "Иван 2", ... . When the first
 * name does not fit the format, the login follows, which always does.
 */
export function* nicknameCandidates(fullName: string, login: string): Generator<string> {
  const words = fullName.trim().split(/\s+/);
  const [surname, firstName = surname] = words;

  if (isNicknameFormat(firstName)) {
    if (words.length > 1) {
      const withInitial = `${firstName} ${surname.charAt(0).toLocaleUpperCase("ru")}.`;
      yield* chain([firstName, withInitial], withInitial);
    } else {
      yield* chain([firstName], firstName);
    }
  }
  yield* chain([login], login);
}

/**
 * The first free default nickname. `isTaken` answers for a candidate as typed; nicknames are
 * unique ignoring case, so it must compare that way. The function does not read the database.
 */
export function defaultNickname(
  fullName: string,
  login: string,
  isTaken: (nickname: string) => boolean,
): string {
  for (const candidate of nicknameCandidates(fullName, login)) {
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error(`No free nickname for user "${login}"`);
}
