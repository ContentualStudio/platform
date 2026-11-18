export function AuthLegalLinks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-muted">
      {/* Terms and privacy live on the marketing site, not in this app, so
          plain anchors are correct here. */}
      {/* oxlint-disable-next-line no-html-link-for-pages */}
      <a className="underline-offset-2 hover:text-foreground" href="/terms">
        Terms of Service
      </a>
      <span>·</span>
      {/* oxlint-disable-next-line no-html-link-for-pages */}
      <a className="underline-offset-2 hover:text-foreground" href="/privacy">
        Privacy Policy
      </a>
    </div>
  );
}
