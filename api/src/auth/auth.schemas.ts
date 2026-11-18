import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email();

export const otpCodeSchema = z.string().regex(/^\d{6}$/);

// Login and sign-up share one OTP mechanism, so the caller has to say which it
// is: "login" refuses to create an account, "signup" refuses to reuse one.
// Defaulting to "login" makes an omitted intent fail closed — a caller that
// forgets it can never silently create an account.
export const authIntentSchema = z.enum(["login", "signup"]).default("login");

export const sendEmailCodeSchema = z.object({
  email: emailSchema,
  intent: authIntentSchema,
});

export const verifyEmailCodeSchema = z.object({
  code: otpCodeSchema,
  email: emailSchema,
  intent: authIntentSchema,
});

export type AuthIntent = z.infer<typeof authIntentSchema>;
export type SendEmailCodeInput = z.infer<typeof sendEmailCodeSchema>;
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;
