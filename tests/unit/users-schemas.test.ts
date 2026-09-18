import { describe, expect, it } from "vitest";

import {
  contractorLinkSchema,
  createUserFormSchema,
  createUserSchema,
  editUserFormSchema,
  editUserWithContractorFormSchema,
  profileSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "@/features/users/schemas";

const validUser = {
  login: "ivanov",
  password: "Secret12345",
  fullName: "Ivan Ivanov",
  nickname: "Ivan",
  nicknameEdited: false,
  position: "",
  email: "",
  phone: "",
  role: "EMPLOYEE",
  isActive: true,
  comment: "",
} as const;

function messagesFor(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.error?.issues.map((issue) => [issue.path.join("."), issue.message]);
}

describe("createUserSchema", () => {
  it("normalizes the login to trimmed lower case", () => {
    expect(createUserSchema.parse({ ...validUser, login: "  Ivanov " }).login).toBe("ivanov");
  });

  it("gives the same result when its own output is parsed again", () => {
    const parsed = createUserSchema.parse({ ...validUser, email: " Ivanov@Example.com " });

    expect(createUserSchema.parse(parsed)).toEqual(parsed);
  });

  it.each([
    ["ab", "users.validation.loginLength"],
    ["a".repeat(33), "users.validation.loginLength"],
    ["ivan ivanov", "users.validation.loginFormat"],
    ["ivan@ivanov", "users.validation.loginFormat"],
  ])("rejects the login %j", (login, message) => {
    expect(messagesFor(createUserSchema.safeParse({ ...validUser, login }))).toEqual([
      ["login", message],
    ]);
  });

  it("accepts dots, dashes and underscores in the login", () => {
    expect(createUserSchema.safeParse({ ...validUser, login: "i.ivanov_2-b" }).success).toBe(true);
  });

  it.each([
    ["Secret123", "users.validation.passwordTooShort"],
    ["SecretSecret", "users.validation.passwordLettersAndDigits"],
    ["1234567890", "users.validation.passwordLettersAndDigits"],
  ])("rejects the password %j", (password, message) => {
    expect(messagesFor(createUserSchema.safeParse({ ...validUser, password }))).toEqual([
      ["password", message],
    ]);
  });

  it("rejects a password equal to the login regardless of case", () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      login: "ivanov12345",
      password: "Ivanov12345",
    });

    expect(messagesFor(result)).toEqual([["password", "users.validation.passwordSameAsLogin"]]);
  });

  it("requires a role from the list", () => {
    expect(messagesFor(createUserSchema.safeParse({ ...validUser, role: "" }))).toEqual([
      ["role", "users.validation.roleRequired"],
    ]);
  });
});

describe("updateUserSchema", () => {
  it("ignores login and password", () => {
    expect(updateUserSchema.parse(validUser)).not.toHaveProperty("login");
    expect(updateUserSchema.parse(validUser)).not.toHaveProperty("password");
  });

  it("keeps an empty email and rejects a malformed one", () => {
    expect(updateUserSchema.parse({ ...validUser, email: "  " }).email).toBe("");
    expect(messagesFor(updateUserSchema.safeParse({ ...validUser, email: "ivanov@" }))).toEqual([
      ["email", "users.validation.emailInvalid"],
    ]);
  });

  it("enforces the length limits", () => {
    const result = updateUserSchema.safeParse({
      ...validUser,
      fullName: "Iv",
      position: "p".repeat(121),
      phone: "1".repeat(33),
      comment: "c".repeat(501),
    });

    expect(messagesFor(result)).toEqual([
      ["fullName", "users.validation.fullNameLength"],
      ["position", "users.validation.positionTooLong"],
      ["phone", "users.validation.phoneTooLong"],
      ["comment", "users.validation.commentTooLong"],
    ]);
  });
});

describe("profileSchema", () => {
  it("keeps only the fields of one's own profile", () => {
    expect(Object.keys(profileSchema.parse(validUser)).sort()).toEqual([
      "email",
      "fullName",
      "nickname",
      "phone",
      "position",
    ]);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects a password equal to the login", () => {
    const result = resetPasswordSchema.safeParse({ login: "petrov2026a", password: "PETROV2026A" });

    expect(messagesFor(result)).toEqual([["password", "users.validation.passwordSameAsLogin"]]);
  });
});

describe("the organisation of a contractor account", () => {
  const required = [["contractorId", "users.validation.contractorRequired"]];
  const contractorForm = { ...validUser, role: "CONTRACTOR", contractorId: "" } as const;

  it("is required by the server schema and the forms of those who may link it", () => {
    expect(
      messagesFor(contractorLinkSchema.safeParse({ role: "CONTRACTOR", contractorId: "" })),
    ).toEqual(required);
    expect(messagesFor(createUserFormSchema.safeParse(contractorForm))).toEqual(required);
    expect(messagesFor(editUserWithContractorFormSchema.safeParse(contractorForm))).toEqual(
      required,
    );
  });

  it("is not asked of a manager, whose form has no such field", () => {
    expect(editUserFormSchema.safeParse(contractorForm).success).toBe(true);
  });

  it("is not needed for another role", () => {
    expect(contractorLinkSchema.safeParse({ role: "EMPLOYEE", contractorId: "" }).success).toBe(
      true,
    );
  });
});
