import { z } from "zod";

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, "auth.validation.loginRequired"),
  password: z.string().min(1, "auth.validation.passwordRequired"),
});

export type LoginInput = z.input<typeof loginSchema>;
