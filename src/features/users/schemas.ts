import { z } from "zod";

import { Role } from "@/generated/prisma/enums";

// The form validates on the client and the action parses the submitted values again,
// so the schemas only normalise strings in place: empty optional fields stay "" here
// and become null when written.

const emailFormat = z.email();

export const userIdSchema = z.cuid();

const loginField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "users.validation.loginLength")
  .max(32, "users.validation.loginLength")
  .regex(/^[a-z0-9._-]+$/, "users.validation.loginFormat");

const passwordField = z
  .string()
  .min(10, "users.validation.passwordTooShort")
  .regex(/\p{L}/u, "users.validation.passwordLettersAndDigits")
  .regex(/\d/, "users.validation.passwordLettersAndDigits");

const profileShape = {
  fullName: z
    .string()
    .trim()
    .min(3, "users.validation.fullNameLength")
    .max(120, "users.validation.fullNameLength"),
  position: z.string().trim().max(120, "users.validation.positionTooLong"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => value === "" || emailFormat.safeParse(value).success,
      "users.validation.emailInvalid",
    ),
  phone: z.string().trim().max(32, "users.validation.phoneTooLong"),
};

const accountShape = {
  ...profileShape,
  role: z.enum(Role, { error: "users.validation.roleRequired" }),
  isActive: z.boolean(),
  comment: z.string().trim().max(500, "users.validation.commentTooLong"),
};

function passwordDiffersFromLogin({ login, password }: { login: string; password: string }) {
  return password.toLowerCase() !== login.toLowerCase();
}

const passwordSameAsLogin = {
  error: "users.validation.passwordSameAsLogin",
  path: ["password"],
};

export const createUserSchema = z
  .object({ login: loginField, password: passwordField, ...accountShape })
  .refine(passwordDiffersFromLogin, passwordSameAsLogin);

export const updateUserSchema = z.object(accountShape);

/** The fields edited in one's own profile (docs/ТЗ.md, 4.8). */
export const profileSchema = z.object(profileShape);

/**
 * The edit form holds the same values as the create form so that one form serves both;
 * login and password are carried along unchecked and updateUserSchema drops them on the server.
 */
export const editUserFormSchema = updateUserSchema.extend({
  login: z.string(),
  password: z.string(),
});

/** `login` is only compared with the password; the action substitutes the stored login. */
export const resetPasswordSchema = z
  .object({ login: z.string(), password: passwordField })
  .refine(passwordDiffersFromLogin, passwordSameAsLogin);

/**
 * The contractor an account belongs to (docs/ТЗ.md, 6.5). Only an account with the CONTRACTOR role
 * has one; the action clears the link in the same transaction when the role changes.
 */
export const contractorLinkSchema = z
  .object({
    role: z.enum(Role, { error: "users.validation.roleRequired" }),
    contractorId: z.union([z.cuid("users.validation.contractorInvalid"), z.literal("")], {
      error: "users.validation.contractorInvalid",
    }),
  })
  .refine(({ role, contractorId }) => contractorId === "" || role === "CONTRACTOR", {
    error: "users.validation.contractorRoleOnly",
    path: ["contractorId"],
  });

export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type ProfileInput = z.input<typeof profileSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ContractorLinkInput = z.input<typeof contractorLinkSchema>;
