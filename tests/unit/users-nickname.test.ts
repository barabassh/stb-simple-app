import type { z } from "zod";
import { describe, expect, it } from "vitest";

import { defaultNickname, nicknameCandidates, suggestedNickname } from "@/features/users/nickname";
import { nicknameSchema } from "@/features/users/schemas";

import ru from "../../messages/ru.json";

/** Taken nicknames, compared ignoring case as the database index does. */
const takenOf =
  (...taken: string[]) =>
  (nickname: string) =>
    taken.some((value) => value.toLowerCase() === nickname.toLowerCase());

const firstCandidates = (fullName: string, login: string, count: number) =>
  nicknameCandidates(fullName, login).take(count).toArray();

describe("defaultNickname", () => {
  it("takes the first name, the second word of the full name", () => {
    expect(defaultNickname("Иванов Иван Иванович", "ivanov", takenOf())).toBe("Иван");
  });

  it("adds the surname initial when the first name is taken, then a number", () => {
    expect(defaultNickname("Иванов Иван Иванович", "ivanov", takenOf("Иван"))).toBe("Иван И.");
    expect(defaultNickname("Иванов Иван Иванович", "ivanov", takenOf("Иван", "Иван И."))).toBe(
      "Иван И. 2",
    );
    expect(
      defaultNickname("Иванов Иван Иванович", "ivanov", takenOf("Иван", "Иван И.", "Иван И. 2")),
    ).toBe("Иван И. 3");
  });

  it("compares with the taken nicknames ignoring case", () => {
    expect(defaultNickname("Иванов Иван Иванович", "ivanov", takenOf("иван", "ИВАН И."))).toBe(
      "Иван И. 2",
    );
  });

  it("uppercases the initial of a surname typed in lower case", () => {
    expect(defaultNickname("иванов иван", "ivanov", takenOf("иван"))).toBe("иван И.");
  });

  it("takes the only word of a one-word full name, then numbers it", () => {
    expect(defaultNickname("Мадонна", "madonna", takenOf())).toBe("Мадонна");
    expect(defaultNickname("Мадонна", "madonna", takenOf("мадонна"))).toBe("Мадонна 2");
  });

  it("ignores extra spaces in the full name", () => {
    expect(firstCandidates("  Иванов   Иван  ", "ivanov", 2)).toEqual(["Иван", "Иван И."]);
  });

  it("takes the login when the first name is a single letter", () => {
    expect(defaultNickname("Петров П", "p.petrov", takenOf())).toBe("p.petrov");
  });

  it("takes the login when the first name has characters a nickname may not have", () => {
    expect(defaultNickname("Шевченко Т/Г", "t.shevchenko", takenOf())).toBe("t.shevchenko");
  });

  it("numbers the login when it is taken as a nickname too", () => {
    expect(defaultNickname("Петров П", "p.petrov", takenOf("P.Petrov"))).toBe("p.petrov 2");
  });

  it("moves on to the login when the numbered first name no longer fits 40 characters", () => {
    const longName = "Я".repeat(36);
    expect(firstCandidates(`Петров ${longName}`, "petrov", 4)).toEqual([
      longName,
      `${longName} П.`,
      "petrov",
      "petrov 2",
    ]);
  });

  it("keeps a first name with an apostrophe or a hyphen", () => {
    expect(defaultNickname("O'Connor Seán", "oconnor", takenOf())).toBe("Seán");
    expect(defaultNickname("Петренко Анна-Марія", "petrenko", takenOf())).toBe("Анна-Марія");
  });
});

describe("nicknameSchema", () => {
  const messagesFor = (result: z.ZodSafeParseResult<unknown>) =>
    result.success ? [] : result.error.issues.map((issue) => issue.message);

  it("trims the edges and collapses repeated spaces", () => {
    expect(nicknameSchema.parse("  Иван   И.  2 ")).toBe("Иван И. 2");
  });

  it.each(["Иван", "Иван И. 2", "jan_de-vries", "D'Artagnan", "Ян", "Seán O’Brien"])(
    "accepts %s",
    (value) => {
      expect(nicknameSchema.safeParse(value).success).toBe(true);
    },
  );

  it("rejects a nickname shorter than 2 or longer than 40 characters", () => {
    expect(messagesFor(nicknameSchema.safeParse(" Я "))).toEqual([
      "users.validation.nicknameLength",
    ]);
    expect(messagesFor(nicknameSchema.safeParse("Я".repeat(41)))).toContain(
      "users.validation.nicknameLength",
    );
    expect(nicknameSchema.safeParse("Я".repeat(40)).success).toBe(true);
  });

  it.each(["Иван/Пётр", "Иван@", "Иван, мастер", "<Иван>"])("rejects %s", (value) => {
    expect(messagesFor(nicknameSchema.safeParse(value))).toEqual([
      "users.validation.nicknameFormat",
    ]);
  });

  it("reports only keys that exist in messages/ru.json", () => {
    const reported = [
      ...messagesFor(nicknameSchema.safeParse("Я")),
      ...messagesFor(nicknameSchema.safeParse("Иван/Пётр")),
    ];
    const keys = new Set(Object.keys(ru.users.validation).map((key) => `users.validation.${key}`));

    expect(reported.length).toBeGreaterThan(0);
    for (const key of reported) expect(keys).toContain(key);
  });
});

describe("suggestedNickname", () => {
  it.each([
    ["Иванов Иван Иванович", "ivanov", "Иван"],
    ["Иван", "ivanov", "Иван"],
    ["Иванов И", " Ivanov ", "ivanov"],
    ["", "", ""],
  ])("suggests for %j and the login %j: %j", (fullName, login, expected) => {
    expect(suggestedNickname(fullName, login)).toBe(expected);
  });
});
