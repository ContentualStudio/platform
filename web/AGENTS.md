<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# @contentual/web conventions

Next.js 16.3, App Router, Turbopack, React 19, Tailwind v4. Lint is **oxlint**
(`.oxlintrc.json`) — there is no ESLint in this workspace.

```bash
yarn workspace @contentual/web dev     # Turbopack dev server
yarn workspace @contentual/web build   # Turbopack build + tsc type check
yarn workspace @contentual/web lint    # oxlint
yarn workspace @contentual/web test    # node --test over src/**/*.test.ts
```

## Cache Components is enabled

`next.config.ts` sets `cacheComponents: true` and `partialPrefetching: true`.
That changes the default rendering contract:

- **Nothing is cached unless you say so.** No `dynamic`, `revalidate`,
  `fetchCache`, or `dynamicParams` route segment exports — they are build
  errors. `unstable_cache` and `noStore()` are gone too.
- **Everything a component renders synchronously becomes the route's static
  shell**, which is prerendered at build time and prefetched on link hover.
  Request-time work must sit behind `<Suspense>` or the build fails with
  `blocking-prerender-dynamic`.

Every route in this app builds as `◐` (partially prerendered). Keep it that way
— a route that drops to `ƒ` means a shell was lost.

### Rule 1 — pages and layouts never `await` at the top level

Split the page into a synchronous default export and an async child:

```tsx
export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const { profile, setup } = await loadStageContext();
  // ...
}
```

Anything that reads `cookies()`, `headers()`, `params`, `searchParams`,
`connection()`, or an uncached `fetch` belongs in the async child. Pass `params`
and `searchParams` **as promises** down to that child and await them there —
awaiting them in the page blocks the shell (see
`(protected)/(setup)/settings/[section]/page.tsx`).

Use the generated `PageProps<"/route">` type instead of hand-writing prop types.

### Rule 2 — the auth gate is Suspense-wrapped, not layout-blocking

`(protected)/layout.tsx` renders nothing but `<Suspense><ProfileGate /></Suspense>`
plus its children. `ProfileGate` (`components/dashboard/profile-gate.tsx`) does
the session read and the `redirect("/auth/sign")`. Never move a profile fetch
back into a layout body: it would make every protected route block again.

`getProfileServer` / `getChallengeSetupServer` are `cache()`d per request, so the
gate, the header, and the page can each call them for the price of one api call.

### Rule 3 — chrome is decided by route group, not `usePathname`

- `(protected)/(app)/` — sidebar **and** persistent header.
- `(protected)/(setup)/` — sidebar only (challenge setup, settings).
- `(protected)/onboarding/` — no chrome.

Add a new route to the group whose chrome it needs. Do not reintroduce
pathname-sniffing in a client component to toggle chrome: client route hooks
(`usePathname`, `useParams`, `useSelectedLayoutSegment(s)`) **suspend** while
prerendering any route with unknown dynamic params, which pulls the whole
subtree out of the shell. If a component genuinely needs one, wrap that
component — the smallest leaf possible — in its own `<Suspense>` (see
`ProtectedShell` around `DashboardSidebar`). `useSearchParams` always needs one.

### Rule 4 — every boundary gets a real skeleton

Fallbacks live in `components/dashboard/shell-skeletons.tsx`,
`components/challenge-setup/setup-skeleton.tsx`, and
`components/auth/auth-skeleton.tsx`. Match the real layout's dimensions so the
shell doesn't shift when the streamed UI lands. `fallback={null}` is only for
components that render no UI (e.g. `ProfileGate`).

### Rule 5 — wrap each boundary in a `catchError` retry boundary

Pages pair their `<Suspense>` with `RetryBoundary`
(`components/error/retry-boundary.tsx`, built with `catchError` from
`next/error`):

```tsx
<RetryBoundary description="We couldn't load your challenge. Please try again.">
  <Suspense fallback={<PageSkeleton />}>
    <DashboardContent />
  </Suspense>
</RetryBoundary>
```

`catchError` boundaries let `notFound()` and `redirect()` pass through — the
auth and stage gates keep working — and their `retry()` re-runs the Server
Components inside, so a brief api outage costs a button press instead of a
reload. `error.tsx` cannot do either; prefer `catchError` for anything smaller
than a whole segment. `HeaderRetryBoundary` is the header-sized variant, and
`app/global-error.tsx` is the root-layout backstop. `ErrorInfo.error` is typed
`unknown` — narrow it before reading `.message`.

### Rule 6 — cache with `use cache`, not fetch options

For data that is **not** per-user and not request-derived:

```tsx
import { cacheLife, cacheTag } from "next/cache";

async function getProgrammes() {
  "use cache";
  cacheLife("hours");
  cacheTag("programmes");
  const res = await fetch(`${apiBaseUrl}/programmes`);
  return res.json();
}
```

- `cacheLife`: `'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max'`.
- Invalidate from a Server Action with `updateTag('programmes')` when the user
  must see their own write immediately; use
  `revalidateTag('programmes', 'max')` from route handlers/webhooks.
- **Never** put `cookies()`, `headers()`, or a user-scoped fetch inside a
  `use cache` scope — it would cache one user's data for everyone. Per-user
  reads stay uncached and live behind `<Suspense>`.

Today no data in this app qualifies: every read is cookie-scoped. Reach for
`use cache` when programme catalogues, plan tiers, or CMS content arrive.

### Rule 7 — state survives navigation

Cache Components keeps routes mounted with React `<Activity>` in hidden mode.
`useState`, form inputs, and scroll position persist across a back-navigation.
Close popovers in a `useLayoutEffect` cleanup, derive dialog state from the URL,
and reset forms explicitly after submit rather than relying on unmount.

### Rule 8 — no synchronous IO in server render paths

`new Date()`, `Date.now()`, `Math.random()`, and `crypto.randomUUID()` fail the
prerender in a Server Component even when the segment sets `instant = false`.
Compute them in a Client Component, or behind `<Suspense>` after `await
connection()`.

### Escape hatch

`export const instant = false` on a page/layout marks a segment as allowed to
block. Use it only as a temporary marker with a comment explaining what needs
fixing — it does not clear synchronous-IO errors.

## The design system is enforced

`globals.css` is the design system, and `yarn design:check` holds the code to
it. It fails on any colour, text size, padding/margin/gap or corner radius that
is not in the token set, on heading levels used out of order, and on the
design system contradicting itself (duplicate colours, values off the scales,
literals where a token belongs).

```bash
yarn design:check          # the gate — runs on every PR
yarn design:check --fix    # apply the unambiguous fixes
yarn design:visual         # Playwright review of every screen, both themes
yarn design:report         # designer-readable HTML into output/design-check/
```

Three things about `globals.css` that will bite if you do not know them:

- **Tailwind's stock `--text-*`, `--radius-*`, `--leading-*`, `--tracking-*`
  and `--shadow-*` ladders are retired** with `*: initial`, and redefined at
  the design's own values. That is what gives the app one scale instead of two.
  The failure mode is silent — a utility naming a token that no longer exists
  makes Tailwind emit nothing at all and the element inherits — so
  `design:check` reports unknown token names as errors. Trust it over your
  memory of Tailwind's defaults.
- **Never set `--spacing: initial`.** Spacing is Tailwind's own scale
  (`--spacing: 0.25rem`); every bare numeric spacing utility resolves through
  it. There is no `--ds-space-*` block any more — it duplicated
  `calc(0.25rem × n)` exactly, and being a second unmapped source is how
  `--ds-space-14` came to be 60px when step 14 is 56px.
- **The rungs were renamed, not just revalued.** When the ladders were
  retired, every named call site was rewritten to whichever rung preserved what
  it rendered: `rounded-md`→`lg`, `lg`→`2xl`, `xl`→`3xl`, `2xl`→`4xl`,
  `3xl`→`2xl`, `leading-tight`→`normal`, `snug`→`body`, `relaxed`→`loose`,
  `shadow-sm`→`soft`, `shadow-xl`→`menu`. `design:check` cannot see this class
  of change — the old names are valid names, they just mean something else now
  — so if you are porting a branch that predates it, apply that mapping by hand.
- **`design-allowlist.json` is not a baseline.** Every exception needs a
  written reason, and an exception that no longer matches anything fails the
  run. Colour relationships (`aliases`, `adjacent`, `themeInvariant`) are
  declared there too — that is what stops the near-duplicate rule from failing
  the system on its own foundation, since page-vs-card sits at ΔE00 2.01.

## Other conventions

- Server actions live in `src/actions/`, never inside the `app/` route tree —
  moving a route would otherwise break every importer.
- Prefer `<Link>` for in-app navigation; plain `<a>` only for the marketing
  site, with an `oxlint-disable-next-line no-html-link-for-pages` comment.
- `yarn lint` must stay at zero warnings. Rules switched off in `.oxlintrc.json`
  are deliberate: `no-array-index-key` (every list here is fixed-length and
  positional — progress ticks, star ratings, OTP slots), plus the jsx-a11y rules
  that misfire on wrapper components (`prefer-tag-over-role`,
  `heading-has-content`, `label-has-associated-control`, `no-autofocus`). Silence
  anything else per line with `oxlint-disable-next-line <rule>` and a reason.
- React Compiler is on (`reactCompiler: true`, running in Turbopack via
  `experimental.turbopackRustReactCompiler`). Don't hand-add `useMemo` /
  `useCallback` for referential-equality reasons alone.
- Turbopack and file tracing are rooted at the monorepo root
  (`next.config.ts`); dependencies are hoisted there by Yarn workspaces.
- TypeScript stays on 6.x: TS 7 has no JS compiler API yet, which breaks
  `ts-node` (tests). `next build` runs the project-local `tsc` for type checking.
