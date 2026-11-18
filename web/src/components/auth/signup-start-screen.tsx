import { Mail } from "lucide-react";
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

interface SignupStartScreenProps {
  authError?: string;
  isGoogleLoading: boolean;
  onContinueWithEmail: () => void;
  onGoogleAuth: () => void;
}

/**
 * First screen of the sign-up door: pick how to create the account. Login skips
 * this and opens on the email field, since a returning user already chose once.
 */
export function SignupStartScreen({
  authError,
  isGoogleLoading,
  onContinueWithEmail,
  onGoogleAuth,
}: SignupStartScreenProps) {
  return (
    <div className="auth-screen-enter flex w-full flex-col items-center">
      <CardHeader className="mb-8 p-0">
        <AuthLogo />
        <CardTitle className="text-2xl font-bold">
          Sign up to create your account
        </CardTitle>
        <CardDescription className="mt-2">
          Start your content journey with Cee
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <GoogleAuthButton isLoading={isGoogleLoading} onClick={onGoogleAuth} />

        <AuthDivider />

        <Button
          className="w-full"
          onClick={onContinueWithEmail}
          type="button"
          variant="outline"
        >
          <Mail data-icon="inline-start" />
          Sign up with email
        </Button>

        {authError ? (
          <p
            className="mt-4 text-center text-sm font-medium leading-body text-destructive"
            role="alert"
          >
            {authError}
          </p>
        ) : null}

        <div className="mt-6">
          <AuthSwitchLink target="login" />
        </div>
      </CardContent>

      <CardFooter className="mt-8 p-0">
        <AuthLegalLinks />
      </CardFooter>
    </div>
  );
}
