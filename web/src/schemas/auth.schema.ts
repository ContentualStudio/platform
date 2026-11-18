import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.");

export const authCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your email.");

/** Which door the user came through: /auth/sign or /auth/signup. */
export const authIntentSchema = z.enum(["login", "signup"]);

export const sendCodeRequestSchema = z.object({
  email: emailSchema,
  intent: authIntentSchema,
});

export const verifyCodeRequestSchema = z.object({
  code: authCodeSchema,
  email: emailSchema,
  intent: authIntentSchema,
});

export const authResponseSchema = z
  .object({
    redirectTo: z.string().min(1).optional(),
  })
  .passthrough();

export const authErrorResponseSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export type AuthIntent = z.infer<typeof authIntentSchema>;
export type SendCodeRequest = z.infer<typeof sendCodeRequestSchema>;
export type VerifyCodeRequest = z.infer<typeof verifyCodeRequestSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
