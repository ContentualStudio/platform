import Link from "next/link";
import type { AuthIntent } from "@/schemas/auth.schema";

const copy = {
  login: {
    href: "/auth/sign",
    label: "Log in",
    prompt: "Already have an account?",
  },
  signup: {
    href: "/auth/signup",
    label: "Sign up",
    prompt: "Don't have an account?",
  },
} as const;

interface AuthSwitchLinkProps {
  /** The door to send the user to, i.e. the opposite of the current screen. */
  target: AuthIntent;
}

/** The one route between the login and sign-up flows, now that they are split. */
export function AuthSwitchLink({ target }: AuthSwitchLinkProps) {
  const { href, label, prompt } = copy[target];

  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1 text-center text-sm text-muted">
      <span>{prompt}</span>
      <Link
        className="font-semibold text-accent transition-opacity duration-200 ease-contentual hover:opacity-80"
        href={href}
      >
        {label}
      </Link>
    </p>
  );
}
