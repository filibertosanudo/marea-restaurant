# Marea — Seafood Restaurant

Landing page and (in progress) ordering system for Marea, a boutique seafood restaurant. This is the flagship demo — "Grupo 1: Comida y Bebida" — of a portfolio of small, deployable business verticals.

## Stack

- [Next.js](https://nextjs.org/) 16 (App Router)
- TypeScript
- Tailwind CSS
- React 19

## Getting started

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

Other scripts:

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Project structure

```
app/               → pages (Next.js App Router)
  admin/(auth)/     → login, forced password change
  admin/(shell)/    → sidebar+topbar shell, menu/categorías/modificadores, equipo
components/ui/      → published design system components (Button, Input, Select,
                       Modal, Table, Tabs, Toast, Nav, MenuCard, StatItem,
                       TestimonialCard, OfferBadge) — synced to Claude Design
components/admin/   → admin-only components (denser variant of the same tokens)
lib/auth/           → Auth.js config, password hashing, role/permission helpers
lib/menu/, lib/team/→ Server Actions, Zod schemas, and centralized queries
lib/dto/            → Prisma.Decimal → string conversion at the client boundary
docs/               → design system spec + database rationale
                       design.md/.html — tokens (source of truth + visual guide)
                       DATABASE.md — schema rationale
styles/             → shared stylesheet for the component library build
```

## Database

Prisma 7 + Postgres. See [`docs/DATABASE.md`](docs/DATABASE.md) for the schema rationale.

```bash
npm run db:migrate    # apply migrations
npm run db:seed       # seed dev data (menu, business, users, orders...)
npm run db:studio     # visual inspector
```

Needs `DATABASE_URL` and `DIRECT_URL` in `.env` (see `.env.example`). For local dev without Supabase, any Postgres works — point both vars at the same instance.

## Payments (Stripe)

Test mode only. Card payments and cash-register collection both exist; a
guest sees the card option only when `Business.acceptsOnlinePayment` is
true. The webhook (`app/api/webhooks/stripe/route.ts`) is the only place a
payment is ever marked `SUCCEEDED` — the client returning from Stripe
proves nothing, it's a URL.

Env vars (see `.env.example`): `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Get test-mode
keys from the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys).

To receive webhooks locally, forward them with the
[Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` prints a `whsec_...` value on startup — put that in
`STRIPE_WEBHOOK_SECRET` (it's different from the Dashboard's webhook
secret; the CLI mints its own for local forwarding). Leave `stripe listen`
running in a second terminal alongside `npm run dev`.

Test cards ([full list](https://docs.stripe.com/testing)):

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Succeeds immediately |
| `4000 0025 0000 3155` | Requires 3D Secure — Stripe's own challenge modal appears mid-confirm |
| `4000 0000 0000 9995` | Declined (insufficient funds) |

Any future expiry date, any 3-digit CVC, any postal code.

To replay an event (checking that a redelivery doesn't double-apply):

```bash
stripe trigger payment_intent.succeeded
```

## Admin panel

`/admin` — staff-only, no public signup. Auth.js (NextAuth v5) with a Credentials provider, argon2id password hashing, JWT sessions.

Built so far: menu management (`/admin/menu` dishes, `/admin/menu/categorias` with drag-to-reorder, `/admin/menu/modificadores`) and `/admin/equipo` (team, BUSINESS_ADMIN/SUPER_ADMIN only). STAFF gets a read-only dish list with just the availability toggle — the one catalog edit their role is allowed. Orders, reservations, promotions, tables/QR, testimonials, and settings are visible in the sidebar (locked) but not built yet.

Dev accounts (seeded, password hash regenerated on every `npm run db:seed`):

| Email | Password | Role |
|---|---|---|
| `super@marea.test` | `MareaSuper123!` | SUPER_ADMIN |
| `admin@marea.test` | `MareaAdmin123!` | BUSINESS_ADMIN |
| `mesero@marea.test` | `MareaTemp123!` | STAFF — forces a password change on first login |

Never reuse these outside a local/dev environment.

## Design system

Colors, typography, spacing, and component tokens are documented in [`docs/design.md`](docs/design.md). Open [`docs/design.html`](docs/design.html) directly in a browser for a live, visual style guide of every token and component.

Brand anchor: navy `#1B367B`, matched to the author's portfolio site so this project reads as part of the same visual family when shown as a preview there.

## Roadmap

- [x] Landing page (hero, about, menu, offers, testimonials, reservation form)
- [x] Component library (Button, Input, Select, Modal, Table, Tabs, Toast, Nav, MenuCard, StatItem, TestimonialCard, OfferBadge)
- [x] Dark mode
- [x] Admin panel: auth, shell, menu management (categories, dishes, modifiers, team) — the landing's menu now reads from the database instead of `content.ts`
- [ ] Digital menu with QR codes
- [ ] Live order cart (realtime status) and kitchen order board
- [ ] Stripe payments
- [ ] Table reservations backend
- [ ] Optional AI assistant for FAQs

## Deployment

Built for [Vercel](https://vercel.com/) or any Next.js-compatible host.
