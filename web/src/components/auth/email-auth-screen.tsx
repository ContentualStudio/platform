import * as React from "react";
import { AuthDivider } from "@/components/auth/auth-divider";
import { AuthLegalLinks } from "@/components/auth/auth-legal-links";
import { AuthLogo } from "@/components/auth/auth-logo";
import { AuthSwitchLink } from "@/components/auth/auth-switch-link";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { AuthIntent } from "@/schemas/auth.schema";

interface EmailAuthScreenProps {
  authError?: string;
  email: string;
  emailError: string;
  isGoogleLoading: boolean;
  isSending: boolean;
  mode: AuthIntent;
  onEmailChange: (email: string) => void;
  onGoogleAuth: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

const copy = {
  login: {
    description: "Enter your email to continue",
    title: "Sign in to Contentual",
  },
  signup: {
    description: "We'll email you a code to confirm it's you",
    title: "Sign up with email",
  },
} as const;

export function EmailAuthScreen({
  authError,
  email,
  emailError,
  isGoogleLoading,
  isSending,
  mode,
  onEmailChange,
  onGoogleAuth,
  onSubmit,
}: EmailAuthScreenProps) {
  return (
    <div className="auth-screen-enter flex w-full flex-col items-center">
      <CardHeader className="mb-8 p-0">
        <AuthLogo />
        <CardTitle className="text-2xl font-bold">
          {copy[mode].title}
        </CardTitle>
        <CardDescription className="mt-2">
          {copy[mode].description}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(emailError) || undefined}>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <Input
                aria-describedby={emailError ? "email-error" : undefined}
                aria-invalid={Boolean(emailError)}
                autoComplete="email"
                id="email"
                inputMode="email"
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="name@example.com"
                required
                type="email"
                value={email}
              />
              {emailError ? (
                <FieldError id="email-error">{emailError}</FieldError>
              ) : null}
            </Field>

            <Button className="w-full" disabled={isSending} type="submit">
              {isSending ? <Spinner data-icon="inline-start" /> : null}
              <span>{isSending ? "Sending" : "Send code"}</span>
            </Button>
          </FieldGroup>
        </form>

        <AuthDivider />
        <GoogleAuthButton isLoading={isGoogleLoading} onClick={onGoogleAuth} />
        {authError ? (
          <p
            className="mt-4 text-center text-sm font-medium leading-body text-destructive"
            role="alert"
          >
            {authError}
          </p>
        ) : null}

        <div className="mt-6">
          <AuthSwitchLink target={mode === "login" ? "signup" : "login"} />
        </div>
      </CardContent>

      <CardFooter className="mt-8 p-0">
        <AuthLegalLinks />
      </CardFooter>
    </div>
  );
}
