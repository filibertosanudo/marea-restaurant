/**
 * Who a visitor can be in the public demo (DEMO_MODE), each one a seeded
 * account with a password already published in the README. Plain data, no
 * server imports: prisma/seed.ts reads the same passwords, so the button and
 * the account it signs into cannot drift apart.
 *
 * The platform's SUPER_ADMIN is deliberately not here, and mesero@marea.test
 * is not either: it is seeded with a forced password change, which in a
 * shared demo the first visitor would make for everyone.
 */
export type DemoPersonaKey = "owner" | "admin" | "waiter" | "kitchen";

export type DemoPersona = {
  key: DemoPersonaKey;
  email: string;
  password: string;
  /** Where the visitor lands: the screen that shows that role best. */
  landing: string;
};

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  { key: "owner", email: "owner@marea.test", password: "MareaOwner123!", landing: "/admin/reportes" },
  { key: "admin", email: "admin@marea.test", password: "MareaAdmin123!", landing: "/admin/menu" },
  { key: "waiter", email: "mesera@marea.test", password: "MareaMesera123!", landing: "/admin/pedidos" },
  { key: "kitchen", email: "mesera@marea.test", password: "MareaMesera123!", landing: "/admin/cocina" },
];

const DEMO_EMAILS = new Set(DEMO_PERSONAS.map((persona) => persona.email));

/** An account every visitor shares in the demo: never locked, never changed. */
export function isDemoAccount(email: string | null | undefined): boolean {
  return Boolean(email) && DEMO_EMAILS.has(email!.trim().toLowerCase());
}
