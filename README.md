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
app/            → pages (Next.js App Router)
components/ui/  → Marea design system components:
                  Button, Input, Select, Modal, Table, Tabs, Toast,
                  Nav, MenuCard, StatItem, TestimonialCard, OfferBadge
docs/           → design system spec
                  design.md  — tokens + rationale (source of truth)
                  design.html — visual style guide, open it in a browser
styles/         → shared stylesheet for the component library build
```

## Database

Prisma 7 + Postgres. See [`docs/DATABASE.md`](docs/DATABASE.md) for the schema rationale.

```bash
npm run db:migrate    # apply migrations
npm run db:seed       # seed dev data (menu, business, users, orders...)
npm run db:studio     # visual inspector
```

Needs `DATABASE_URL` and `DIRECT_URL` in `.env` (see `.env.example`). For local dev without Supabase, any Postgres works — point both vars at the same instance.

## Admin panel

`/admin` — staff-only, no public signup. Auth.js (NextAuth v5) with a Credentials provider, argon2id password hashing, JWT sessions.

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
- [ ] Dark mode
- [ ] Digital menu with QR codes and categories
- [ ] Live order cart (realtime status)
- [ ] Admin panel (menu management)
- [ ] Stripe payments
- [ ] Table reservations backend
- [ ] Optional AI assistant for FAQs

## Deployment

Built for [Vercel](https://vercel.com/) or any Next.js-compatible host.
