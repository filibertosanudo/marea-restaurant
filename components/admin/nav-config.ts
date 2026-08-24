import { UserRole } from "@/lib/generated/prisma/client";

export type AdminNavKey =
  | "menu"
  | "orders"
  | "reservations"
  | "promotions"
  | "tables"
  | "testimonials"
  | "team"
  | "settings";

export type AdminNavItem = {
  key: AdminNavKey;
  href: string;
  roles: UserRole[];
  /** Built and reachable in this module, vs. visible-but-locked scope preview. */
  enabled: boolean;
};

const STAFF_UP = [UserRole.STAFF, UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN];
const ADMIN_ONLY = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN];

// Order matches the product's intended build sequence (see
// docs/product/roles-y-alcance.md §4) — Menú and Equipo are real routes
// built in this module; the rest are locked previews of later modules.
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: "menu", href: "/admin/menu", roles: STAFF_UP, enabled: true },
  { key: "orders", href: "/admin/pedidos", roles: STAFF_UP, enabled: false },
  { key: "reservations", href: "/admin/reservaciones", roles: STAFF_UP, enabled: false },
  { key: "promotions", href: "/admin/promociones", roles: ADMIN_ONLY, enabled: false },
  { key: "tables", href: "/admin/mesas", roles: ADMIN_ONLY, enabled: false },
  { key: "testimonials", href: "/admin/testimonios", roles: ADMIN_ONLY, enabled: false },
  { key: "team", href: "/admin/equipo", roles: ADMIN_ONLY, enabled: true },
  { key: "settings", href: "/admin/configuracion", roles: ADMIN_ONLY, enabled: false },
];

export function navItemsForRole(role: UserRole): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => item.roles.includes(role));
}
