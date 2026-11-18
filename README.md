# Contentual

Isolated Yarn workspaces monorepo with:

- `web`: Next.js frontend
- `api`: NestJS backend
- `cms`: Payload CMS for content authoring

> **Note:** this repo uses the `node-modules` linker rather than Yarn Plug'n'Play. Payload requires exactly one copy of `payload`, `@payloadcms/*` and `react` in the dependency graph; PnP creates a separate virtual instance per peer-dependency resolution, which gives the admin panel multiple React contexts and breaks it at runtime. Do not switch `nodeLinker` back to `pnp`.

## Local Development

```bash
yarn install
yarn dev:web
yarn dev:api
yarn dev:cms
```

The web app runs on `http://localhost:3000`.
The API runs on `http://localhost:3001`.
The CMS admin runs on `http://localhost:3002/admin`.

The CMS needs its own database and env before `yarn dev:cms` will start — see [docs/cms.md](docs/cms.md) for the setup steps. It owns its own Postgres schema, separate from the app database.

## Build

```bash
yarn build
```

## Railway Deployment

Create one Railway project with three app services:

- `web`, with root directory `/web`
- `api`, with root directory `/api`
- `cms`, with root directory `/cms`

Plus two Postgres databases: one for the app (`api`) and a separate one for Payload (`cms`). The two schemas are managed independently and neither migrates the other's tables.

Each app includes a `railway.toml` with its own build and start commands. See [docs/railway.md](docs/railway.md) for the exact setup commands, and [docs/cms.md](docs/cms.md) for the CMS-specific environment variables.

## Billing (Stripe)

Subscriptions run through Stripe; the api owns every decision. Tiers and what
they unlock live in `api/src/billing/billing-tiers.ts`; prices live only in
Stripe and are referenced by id from the api environment (see the Billing
block in `api/.env.example`). With no `STRIPE_SECRET_KEY` the api binds a stub:
reads still work, checkout and the portal refuse, and the test suites run
without credentials.

- `yarn workspace @contentual/api stripe:bootstrap` provisions test-mode
  products, prices and the alpha coupon and prints the variables to set.
- Register `https://<api-host>/billing/stripe/webhook` in Stripe for
  `checkout.session.completed`, `customer.subscription.*`, `invoice.paid` and `customer.deleted`.
  The webhook is the only writer of subscription state; a Checkout return
  never grants access.
- `yarn workspace @contentual/api billing:reconcile -- --email <address>`
  pulls a subscription from Stripe through the same path when no webhook can
  reach the machine (local development, recovery).
- `yarn workspace @contentual/api billing:founding -- --email <address> --grant|--unflag`
  is the manual founding-creator support action.

Gates are authored in the CMS: `minimumTier` on a programme and `paidOnly` on
a lesson. Free members see 7 and 30 days of analytics; 90-day history, gated
programmes and paid-only lesson bodies open on Creator and Pro.

