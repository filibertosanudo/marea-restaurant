/**
 * Marea — seed de desarrollo
 * ---------------------------------------------------------------------------
 * Datos reales tomados de components/marea-landing/content.ts, para que al
 * migrar el landing a la base de datos veas EXACTAMENTE el mismo menú.
 *
 * Es idempotente: usa upsert con llaves naturales (slug), así que puedes
 * correrlo mil veces sin duplicar nada.
 *
 *   npx prisma migrate reset      # migra + corre este seed
 *   npx tsx prisma/seed.ts        # sólo el seed
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../lib/generated/prisma/client";
// Prisma 6:  import { PrismaClient, Prisma } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import { DEMO_PERSONAS } from "../lib/demo/personas";
import { seedHistory } from "./seed-history";
import { safeHostname } from "../lib/url";

// Contraseñas de desarrollo para el personal sembrado — documentadas en el
// README. Nunca uses estos valores fuera de un entorno local.
const DEV_PASSWORDS: Record<string, string> = {
  "super@marea.test": "MareaSuper123!",
  "admin@marea.test": "MareaAdmin123!",
  "mesero@marea.test": "MareaTemp123!", // mustChangePassword: true — ver abajo
  // Segundo negocio y su cadena (ver seedSecondBusiness).
  "owner@marea.test": "MareaOwner123!", // ORG_ADMIN de la cadena "Marea Group"
  "admin@cala.test": "CalaAdmin123!", // BUSINESS_ADMIN sólo de Cala
  // Las cuentas de la demo pública (DEMO_MODE) toman su contraseña de
  // lib/demo/personas.ts, la misma que usa el botón de acceso de un clic.
  ...Object.fromEntries(DEMO_PERSONAS.map((p) => [p.email, p.password])),
};

// Deliberately just loopback addresses, not a Docker Compose service name
// like "db" — that hostname means exactly the same thing inside this
// project's own recommended production Compose file, so it's no signal of
// "not production" at all and would defeat this guard for the one topology
// it most needs to catch.
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]", "::1"];

// The same DIRECT_URL ?? DATABASE_URL resolution prisma.config.ts uses —
// DIRECT_URL is only set at all if a transaction-mode pooler sits in front
// of the app, which most deployments (this project's own docker-compose.yml
// included) don't have.
function connectionUrl(): string | undefined {
  return process.env.DIRECT_URL ?? process.env.DATABASE_URL;
}

// pg's own connection-string parser (pg-connection-string, underneath
// @prisma/adapter-pg) treats a "host" or "hostaddr" query parameter as an
// override that wins over the URL's own authority — safeHostname() below
// doesn't know that, so "postgresql://localhost/db?host=some-real-deploy"
// would read as local here while pg actually connects somewhere else
// entirely. Either param makes the parsed hostname untrustworthy for this
// check, so its presence is treated as "not local" rather than trusted.
function hasConnectionOverride(rawUrl: string): boolean {
  try {
    const params = new URL(rawUrl).searchParams;
    return params.has("host") || params.has("hostaddr");
  } catch {
    return false;
  }
}

// DEV_PASSWORDS above are public (they're in the README): seeding a real
// deployment by accident — the exact mistake a first deploy invites — hands
// out SUPER_ADMIN to anyone who reads it. Refuses unless the target is
// unmistakably local, or the escape hatch is typed on purpose. Checks the
// same URL the PrismaPg adapter below actually connects with.
function assertLocalTarget(): void {
  if (process.env.I_KNOW_WHAT_IM_DOING === "1") return;

  const rawUrl = connectionUrl();
  const host = rawUrl ? safeHostname(rawUrl) : null;
  const isProduction = process.env.NODE_ENV === "production";
  const isLocal =
    rawUrl !== undefined &&
    host !== null &&
    LOCAL_HOSTNAMES.includes(host) &&
    !hasConnectionOverride(rawUrl);

  if (isProduction || !isLocal) {
    console.error(
      `Refusing to seed: target host "${host ?? "unknown"}" doesn't look local ` +
        `(NODE_ENV=${process.env.NODE_ENV ?? "unset"}).\n` +
        "Seeded accounts have passwords published in the README.\n" +
        "Set I_KNOW_WHAT_IM_DOING=1 to seed anyway."
    );
    process.exit(1);
  }
}

assertLocalTarget();

// Prisma 7: PrismaClient no longer accepts a direct URL, it needs a driver
// adapter.
const adapter = new PrismaPg({ connectionString: connectionUrl() });
const prisma = new PrismaClient({ adapter });

const BUSINESS_SLUG = "marea";
const D = (v: string) => new Prisma.Decimal(v);

// ---------------------------------------------------------------------------
// Catálogo de Marea: una marisquería de Mazatlán, cliente de ejemplo
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { slug: "crudos", sortOrder: 1, en: "Raw bar", es: "Crudos" },
  { slug: "tostadas", sortOrder: 2, en: "Tostadas", es: "Tostadas" },
  { slug: "tacos", sortOrder: 3, en: "Tacos", es: "Tacos" },
  { slug: "fuertes", sortOrder: 4, en: "Mains", es: "Fuertes" },
  { slug: "postres", sortOrder: 5, en: "Desserts", es: "Postres" },
  { slug: "bebidas", sortOrder: 6, en: "Drinks", es: "Bebidas" },
];

// Precios en MXN antes de IVA (el negocio suma su 16% al cobrar).
// `image` nombra una foto de public/demo/ (docs/demo-photos.md).
const DISHES = [
  {
    slug: "aguachile-verde",
    category: "crudos",
    price: "245.00",
    featured: true,
    prep: 10,
    tags: ["shellfish", "gluten-free", "spicy"],
    image: "aguachile",
    en: { name: "Green Aguachile", desc: "Raw shrimp cured in lime with serrano chile, cucumber and red onion. Served with tostadas." },
    es: { name: "Aguachile Verde", desc: "Camarón crudo curtido en limón con chile serrano, pepino y cebolla morada. Con tostadas." },
  },
  {
    slug: "coctel-de-camaron",
    category: "crudos",
    price: "210.00",
    featured: false,
    prep: 8,
    tags: ["shellfish", "gluten-free"],
    image: "coctel-camaron",
    en: { name: "Shrimp Cocktail", desc: "Poached shrimp in our tomato and lime sauce with avocado, onion and cilantro." },
    es: { name: "Coctel de Camarón", desc: "Camarón cocido en nuestra salsa de jitomate y limón, con aguacate, cebolla y cilantro." },
  },
  {
    slug: "ceviche-de-sierra",
    category: "crudos",
    price: "185.00",
    featured: false,
    prep: 10,
    tags: ["gluten-free"],
    image: "ceviche",
    en: { name: "Sierra Ceviche", desc: "Mazatlán style: finely chopped sierra fish with carrot, cucumber, tomato and lime." },
    es: { name: "Ceviche de Sierra", desc: "Estilo Mazatlán: sierra picada fina con zanahoria, pepino, jitomate y limón." },
  },
  {
    slug: "ostiones-en-su-concha",
    category: "crudos",
    price: "220.00",
    featured: false,
    prep: 8,
    tags: ["shellfish"],
    image: "ostiones",
    en: { name: "Oysters on the Half Shell", desc: "Half a dozen fresh oysters with lime, house hot sauce and saltines." },
    es: { name: "Ostiones en su Concha", desc: "Media docena de ostiones frescos con limón, salsa de la casa y galletas saladas." },
  },
  {
    slug: "tostada-de-atun",
    category: "tostadas",
    price: "175.00",
    featured: true,
    prep: 8,
    tags: [],
    image: "tostada-atun",
    en: { name: "Tuna Tostada", desc: "Fresh tuna, avocado, chipotle mayo and crispy onion on a corn tostada." },
    es: { name: "Tostada de Atún", desc: "Atún fresco, aguacate, mayonesa de chipotle y cebolla crujiente sobre tostada de maíz." },
  },
  {
    slug: "tacos-gobernador",
    category: "tacos",
    price: "195.00",
    featured: true,
    prep: 12,
    tags: ["shellfish"],
    image: "tacos-gobernador",
    en: { name: "Gobernador Tacos", desc: "Three tacos of shrimp sautéed with poblano pepper and melted cheese, on corn tortillas." },
    es: { name: "Tacos Gobernador", desc: "Tres tacos de camarón salteado con chile poblano y queso gratinado, en tortilla de maíz." },
  },
  {
    slug: "tacos-de-pescado",
    category: "tacos",
    price: "165.00",
    featured: false,
    prep: 10,
    tags: [],
    image: "tacos-pescado",
    en: { name: "Battered Fish Tacos", desc: "Three Ensenada-style tacos with cabbage, cream and pico de gallo." },
    es: { name: "Tacos de Pescado Capeado", desc: "Tres tacos estilo Ensenada con col, crema y pico de gallo." },
  },
  {
    slug: "pescado-zarandeado",
    category: "fuertes",
    price: "480.00",
    featured: true,
    prep: 40,
    tags: ["gluten-free", "chefs-choice"],
    image: "zarandeado",
    en: { name: "Zarandeado Fish", desc: "Whole snook, butterflied and grilled over mangrove charcoal with our chile marinade. Serves 2 to 3." },
    es: { name: "Pescado Zarandeado", desc: "Robalo entero abierto, asado al carbón de mangle con nuestro adobo. Para 2 o 3 personas." },
  },
  {
    slug: "pulpo-a-las-brasas",
    category: "fuertes",
    price: "365.00",
    featured: true,
    prep: 30,
    tags: ["gluten-free", "chefs-choice"],
    image: "pulpo",
    en: { name: "Grilled Octopus", desc: "Charred octopus with garlic and guajillo oil, roasted potatoes and a green salad." },
    es: { name: "Pulpo a las Brasas", desc: "Pulpo asado con aceite de ajo y guajillo, papas al horno y ensalada verde." },
  },
  {
    slug: "camarones-para-pelar",
    category: "fuertes",
    price: "295.00",
    featured: false,
    prep: 15,
    tags: ["shellfish", "gluten-free", "spicy"],
    image: "camarones",
    en: { name: "Peel-and-Eat Shrimp", desc: "Half a kilo of boiled shrimp with lime, house salsa and chile powder." },
    es: { name: "Camarones para Pelar", desc: "Medio kilo de camarón cocido con limón, salsa de la casa y chile en polvo." },
  },
  {
    slug: "mojarra-frita",
    category: "fuertes",
    price: "260.00",
    featured: false,
    prep: 20,
    tags: ["gluten-free"],
    image: "mojarra",
    en: { name: "Fried Whole Mojarra", desc: "Crispy whole fish with rice, salad, tomato and lime." },
    es: { name: "Mojarra Frita", desc: "Mojarra entera dorada, con arroz, ensalada, jitomate y limón." },
  },
  {
    slug: "pay-de-limon",
    category: "postres",
    price: "95.00",
    featured: false,
    prep: 5,
    tags: ["vegetarian"],
    image: "pay-limon",
    en: { name: "Lime Pie", desc: "Creamy lime filling on a crushed María cookie crust." },
    es: { name: "Pay de Limón", desc: "Relleno cremoso de limón sobre base de galleta María." },
  },
  {
    slug: "flan-napolitano",
    category: "postres",
    price: "85.00",
    featured: false,
    prep: 5,
    tags: ["vegetarian", "gluten-free"],
    image: "flan",
    en: { name: "Flan Napolitano", desc: "Classic vanilla flan with caramel." },
    es: { name: "Flan Napolitano", desc: "Flan de vainilla clásico con caramelo." },
  },
  {
    slug: "michelada",
    category: "bebidas",
    price: "110.00",
    featured: false,
    prep: 4,
    tags: [],
    image: "michelada",
    en: { name: "Michelada", desc: "Mexican beer with lime, house sauces and a chile-salt rim." },
    es: { name: "Michelada", desc: "Cerveza con limón, salsas de la casa y escarchado de chile." },
  },
  {
    slug: "agua-de-jamaica",
    category: "bebidas",
    price: "45.00",
    featured: false,
    prep: 2,
    tags: ["non-alcoholic", "vegan"],
    image: "jamaica",
    en: { name: "Hibiscus Agua Fresca", desc: "Chilled hibiscus flower water, lightly sweetened." },
    es: { name: "Agua de Jamaica", desc: "Agua fresca de flor de jamaica, poco dulce." },
  },
];

const TAGS = [
  { slug: "shellfish", en: "Shellfish", es: "Mariscos", color: "#e07a5f" },
  { slug: "gluten-free", en: "Gluten free", es: "Sin gluten", color: "#81b29a" },
  { slug: "vegetarian", en: "Vegetarian", es: "Vegetariano", color: "#6a994e" },
  { slug: "vegan", en: "Vegan", es: "Vegano", color: "#386641" },
  { slug: "non-alcoholic", en: "Non-alcoholic", es: "Sin alcohol", color: "#3d5a80" },
  { slug: "chefs-choice", en: "Chef's choice", es: "Recomendación del chef", color: "#f2cc8f" },
  { slug: "spicy", en: "Spicy", es: "Picante", color: "#d62828" },
];

const TESTIMONIALS = [
  {
    name: "Mariana López",
    sourceLocale: "es",
    en: "The best green aguachile I've had in Mazatlán, and the view from the palapa is priceless.",
    es: "El aguachile verde es el mejor que he probado en Mazatlán, y la vista desde la palapa no tiene precio.",
  },
  {
    name: "Jorge Ibarra",
    sourceLocale: "es",
    en: "We ordered the zarandeado for four and nothing was left. Quick service even though it was packed.",
    es: "Pedimos el zarandeado para cuatro y no sobró nada. Atención rápida aunque estaba lleno.",
  },
  {
    name: "Daniela Osuna",
    sourceLocale: "es",
    en: "Ordering from the table with the QR code was so easy; the food arrived in minutes.",
    es: "Pedir desde la mesa con el QR fue facilísimo; la comida llegó en minutos.",
  },
  {
    name: "Roberto Félix",
    sourceLocale: "es",
    en: "I come every time I'm in town. The gobernador tacos are a must.",
    es: "Vengo cada vez que estoy en el puerto. Los tacos gobernador, obligatorios.",
  },
  {
    name: "Claire Thompson",
    sourceLocale: "en",
    en: "Fresh, honest seafood and a menu in English for us. We booked twice in the same week.",
    es: "Mariscos frescos y honestos, y el menú en inglés para nosotros. Reservamos dos veces en la misma semana.",
  },
  {
    name: "Ana Sofía Rentería",
    sourceLocale: "es",
    en: "The grilled octopus was perfect. We'll be back for my mom's birthday.",
    es: "El pulpo a las brasas estaba perfecto. Volveremos para el cumpleaños de mi mamá.",
  },
];

// ---------------------------------------------------------------------------
// Segundo negocio: Cala, en la misma cadena que Marea
// ---------------------------------------------------------------------------
//
// Existe para que el aislamiento entre negocios se pruebe contra datos
// reales y no contra un solo inquilino: los mismos folios ("A-0001"), otro
// menú, otras mesas, otro personal. Marea y Cala forman la cadena "Marea
// Group", cuyo dueño es owner@marea.test (ORG_ADMIN); nadie más ve las dos.

const CALA_SLUG = "cala";

const CALA_CATEGORIES = [
  { slug: "coffee", sortOrder: 1, en: "Coffee", es: "Café" },
  { slug: "bites", sortOrder: 2, en: "Bites", es: "Bocados" },
];

const CALA_DISHES = [
  { slug: "flat-white", category: "coffee", price: "62.00", en: { name: "Flat White", desc: "Double ristretto with silky steamed milk." }, es: { name: "Flat White", desc: "Doble ristretto con leche vaporizada sedosa." } },
  { slug: "cold-brew", category: "coffee", price: "68.00", en: { name: "Cold Brew", desc: "Steeped for eighteen hours, served over ice." }, es: { name: "Cold Brew", desc: "Reposado dieciocho horas, servido con hielo." } },
  { slug: "avocado-toast", category: "bites", price: "135.00", en: { name: "Avocado Toast", desc: "Sourdough, smashed avocado, lime and chili flakes." }, es: { name: "Pan con Aguacate", desc: "Masa madre, aguacate, limón y hojuelas de chile." } },
  { slug: "conchas", category: "bites", price: "48.00", en: { name: "Conchas", desc: "Two house-made sweet rolls, still warm." }, es: { name: "Conchas", desc: "Dos conchas hechas en casa, todavía tibias." } },
];

async function seedSecondBusiness(marea: { id: string }) {
  const organization = await prisma.organization.upsert({
    where: { slug: "marea-group" },
    update: {},
    // verifiedAt set: seed data is meant to behave like a live business, not
    // one stuck behind module 19's email-verification gate.
    create: { slug: "marea-group", name: "Marea Group", verifiedAt: new Date() },
  });
  await prisma.business.update({ where: { id: marea.id }, data: { organizationId: organization.id } });

  const cala = await prisma.business.upsert({
    where: { slug: CALA_SLUG },
    update: { organizationId: organization.id },
    create: {
      slug: CALA_SLUG,
      name: "Cala",
      type: "CAFE",
      defaultLocale: "es",
      supportedLocales: ["en", "es"],
      currency: "MXN",
      timezone: "America/Mazatlan",
      taxRate: D("0.1600"),
      email: "hola@cala.test",
      phone: "+52 669 981 2041",
      addressLine1: "Av. Camarón Sábalo 204",
      addressLine2: "Zona Dorada",
      city: "Mazatlán, Sinaloa",
      country: "MX",
      acceptsOnlinePayment: false, // sin cuenta de Stripe propia todavía (módulo 17b)
      acceptsPayAtCounter: true,
      organizationId: organization.id,
      onboardingStep: 4,
      onboardingCompletedAt: new Date(),
    },
  });

  for (const [locale, tagline] of [["en", "Small coffee, big mornings."], ["es", "Café pequeño, mañanas grandes."]] as const) {
    await prisma.businessTranslation.upsert({
      where: { businessId_locale: { businessId: cala.id, locale } },
      update: {},
      create: { businessId: cala.id, locale, tagline, shortBlurb: tagline, aboutTitle: "Cala", aboutBody: tagline, metaTitle: "Cala", metaDescription: tagline },
    });
  }

  // Abierto todos los días de 7:00 a 15:00.
  for (let day = 0; day <= 6; day++) {
    await prisma.openingHour.upsert({
      where: { businessId_dayOfWeek_opensAt: { businessId: cala.id, dayOfWeek: day, opensAt: 420 } },
      update: {},
      create: { businessId: cala.id, dayOfWeek: day, opensAt: 420, closesAt: 900 },
    });
  }

  const categoryIds = new Map<string, string>();
  for (const c of CALA_CATEGORIES) {
    const category = await prisma.menuCategory.upsert({
      where: { businessId_slug: { businessId: cala.id, slug: c.slug } },
      update: { sortOrder: c.sortOrder },
      create: { businessId: cala.id, slug: c.slug, sortOrder: c.sortOrder },
    });
    categoryIds.set(c.slug, category.id);
    for (const [locale, name] of [["en", c.en], ["es", c.es]] as const) {
      await prisma.menuCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: category.id, locale } },
        update: { name },
        create: { categoryId: category.id, locale, name },
      });
    }
  }

  const dishIds = new Map<string, string>();
  for (const [i, d] of CALA_DISHES.entries()) {
    const item = await prisma.menuItem.upsert({
      where: { businessId_slug: { businessId: cala.id, slug: d.slug } },
      update: { basePrice: D(d.price), isAvailable: true },
      create: { businessId: cala.id, categoryId: categoryIds.get(d.category)!, slug: d.slug, basePrice: D(d.price), preparationMinutes: 5, sortOrder: i },
    });
    dishIds.set(d.slug, item.id);
    for (const [locale, tr] of [["en", d.en], ["es", d.es]] as const) {
      await prisma.menuItemTranslation.upsert({
        where: { menuItemId_locale: { menuItemId: item.id, locale } },
        update: { name: tr.name, description: tr.desc },
        create: { menuItemId: item.id, locale, name: tr.name, description: tr.desc, imageAlt: tr.name },
      });
    }
  }

  const tableIds: string[] = [];
  for (let n = 1; n <= 4; n++) {
    const code = `C-${String(n).padStart(2, "0")}`;
    const table = await prisma.restaurantTable.upsert({
      where: { businessId_code: { businessId: cala.id, code } },
      update: {},
      create: { businessId: cala.id, code, zone: "Salón", seats: 2, sortOrder: n },
    });
    tableIds.push(table.id);
  }

  // Personal: un administrador propio de Cala, y el dueño de la cadena.
  const staff = await Promise.all(
    [
      { email: "admin@cala.test", name: "Valeria Cota", role: "BUSINESS_ADMIN" as const, organizationId: null },
      { email: "owner@marea.test", name: "Marea Group Owner", role: "ORG_ADMIN" as const, organizationId: organization.id },
    ].map(async (u) => {
      const passwordHash = await hashPassword(DEV_PASSWORDS[u.email]);
      return prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash, mustChangePassword: false },
        create: { email: u.email, name: u.name, role: u.role, organizationId: u.organizationId, emailVerified: new Date(), locale: "es", passwordHash },
      });
    })
  );
  const [calaAdmin] = staff;
  await prisma.businessMembership.upsert({
    where: { userId_businessId: { userId: calaAdmin.id, businessId: cala.id } },
    update: {},
    create: { userId: calaAdmin.id, businessId: cala.id, role: "BUSINESS_ADMIN" },
  });

  // Un pedido con el MISMO folio que el primero de Marea: los folios son por
  // negocio, y es la forma más barata de notarlo si algo los mezcla.
  const exists = await prisma.order.findUnique({
    where: { businessId_orderNumber: { businessId: cala.id, orderNumber: "A-0001" } },
  });
  if (!exists) {
    const unit = D("62.00");
    const subtotal = unit.mul(2);
    const tax = subtotal.mul(D("0.16")).toDecimalPlaces(2);
    const order = await prisma.order.create({
      data: {
        businessId: cala.id,
        orderNumber: "A-0001",
        type: "DINE_IN",
        status: "PENDING",
        tableId: tableIds[0],
        guestName: "Cliente de Cala",
        guestCount: 1,
        subtotal,
        taxTotal: tax,
        total: subtotal.add(tax),
        currency: "MXN",
        items: { create: [{ menuItemId: dishIds.get("flat-white")!, nameSnapshot: "Flat White", unitPrice: unit, quantity: 2, lineTotal: subtotal }] },
        statusEvents: { create: [{ toStatus: "PENDING" }] },
      },
    });
    await prisma.payment.create({
      data: { businessId: cala.id, orderId: order.id, provider: "CASH_REGISTER", status: "PENDING", amount: order.total, currency: "MXN" },
    });
  }
}

async function main() {
  console.log("🌊 Seeding Marea…");

  // -------------------------------------------------------------------------
  // 1. Negocio
  // -------------------------------------------------------------------------
  const business = await prisma.business.upsert({
    where: { slug: BUSINESS_SLUG },
    update: {},
    create: {
      slug: BUSINESS_SLUG,
      name: "Marea",
      type: "SEAFOOD_RESTAURANT",
      defaultLocale: "es",
      supportedLocales: ["es", "en"],
      currency: "MXN",
      timezone: "America/Mazatlan",
      taxRate: D("0.1600"),
      email: "hola@marea.test",
      phone: "+52 669 981 2040",
      addressLine1: "Paseo Olas Altas 1120",
      addressLine2: "Centro Histórico",
      city: "Mazatlán, Sinaloa",
      country: "MX",
      acceptsOnlinePayment: true,
      acceptsPayAtCounter: true,
      // Past module 19's wizard: seed data behaves like a live business.
      onboardingStep: 4,
      onboardingCompletedAt: new Date(),
    },
  });

  await Promise.all([
    prisma.businessTranslation.upsert({
      where: { businessId_locale: { businessId: business.id, locale: "en" } },
      update: {},
      create: {
        businessId: business.id,
        locale: "en",
        tagline: "Mazatlán seafood, fresh every day.",
        shortBlurb:
          "A seaside seafood house on Olas Altas: aguachiles, zarandeado fish and the catch of the day.",
        aboutTitle: "Today's catch, family recipes.",
        aboutBody:
          "Since 1998 we have cooked whatever the boats bring in each morning: aguachiles made to order, zarandeado fish over mangrove charcoal and tostadas the way the family makes them. Nothing frozen, nothing from last week.",
        metaTitle: "Marea — Seafood in Mazatlán",
        metaDescription:
          "Seaside seafood on Olas Altas, Mazatlán. Aguachiles, zarandeado fish and tostadas. Book a table or order from yours.",
      },
    }),
    prisma.businessTranslation.upsert({
      where: { businessId_locale: { businessId: business.id, locale: "es" } },
      update: {},
      create: {
        businessId: business.id,
        locale: "es",
        tagline: "Mariscos de Mazatlán, frescos todos los días.",
        shortBlurb:
          "Marisquería frente al mar en Olas Altas: aguachiles, zarandeado y la pesca del día.",
        aboutTitle: "Pesca del día, recetas de la casa.",
        aboutBody:
          "Desde 1998 cocinamos lo que traen las pangas cada mañana: aguachiles al momento, pescado zarandeado al carbón de mangle y tostadas como las hace la familia. Nada congelado, nada de la semana pasada.",
        metaTitle: "Marea — Mariscos en Mazatlán",
        metaDescription:
          "Marisquería frente al mar en Olas Altas, Mazatlán. Aguachiles, pescado zarandeado y tostadas. Reserva o pide desde tu mesa.",
      },
    }),
  ]);

  // Horario: Abierto Mar–Dom · 12pm – 11pm (lunes cerrado)
  // 12:00 = 720 min, 23:00 = 1380 min
  for (let day = 0; day <= 6; day++) {
    const closed = day === 1; // lunes
    await prisma.openingHour.upsert({
      where: {
        businessId_dayOfWeek_opensAt: {
          businessId: business.id,
          dayOfWeek: day,
          opensAt: 720,
        },
      },
      update: {},
      create: {
        businessId: business.id,
        dayOfWeek: day,
        opensAt: 720,
        closesAt: 1380,
        isClosed: closed,
      },
    });
  }

  // -------------------------------------------------------------------------
  // 2. Usuarios — uno por cada rol, para probar permisos
  // -------------------------------------------------------------------------
  const users = await Promise.all(
    [
      { email: "super@marea.test", name: "Platform Admin", role: "SUPER_ADMIN" as const },
      { email: "admin@marea.test", name: "Camila Ortega", role: "BUSINESS_ADMIN" as const },
      { email: "mesero@marea.test", name: "Diego Fuentes", role: "STAFF" as const, mustChangePassword: true },
      { email: "mesera@marea.test", name: "Renata Ibarra", role: "STAFF" as const },
      { email: "cliente@marea.test", name: "Fili Sañudo", role: "CUSTOMER" as const },
    ].map(async (u) => {
      const plainPassword = DEV_PASSWORDS[u.email];
      const passwordHash = plainPassword ? await hashPassword(plainPassword) : null;
      const mustChangePassword = "mustChangePassword" in u ? u.mustChangePassword : false;
      return prisma.user.upsert({
        where: { email: u.email },
        update: passwordHash ? { passwordHash, mustChangePassword } : {},
        create: {
          email: u.email,
          name: u.name,
          role: u.role,
          emailVerified: new Date(),
          locale: u.role === "CUSTOMER" ? "es" : "es",
          passwordHash,
          mustChangePassword,
        },
      });
    })
  );

  const [, admin, waiter, , customer] = users;

  // Membresías (la costura multi-tenant: en v1 es 1 fila por empleado)
  for (const u of users.filter((x) => x.role !== "CUSTOMER" && x.role !== "SUPER_ADMIN")) {
    await prisma.businessMembership.upsert({
      where: { userId_businessId: { userId: u.id, businessId: business.id } },
      update: {},
      create: { userId: u.id, businessId: business.id, role: u.role },
    });
  }

  // -------------------------------------------------------------------------
  // 3. Etiquetas
  // -------------------------------------------------------------------------
  const tagMap = new Map<string, string>();
  for (const t of TAGS) {
    const tag = await prisma.tag.upsert({
      where: { businessId_slug: { businessId: business.id, slug: t.slug } },
      update: {},
      create: { businessId: business.id, slug: t.slug, color: t.color },
    });
    tagMap.set(t.slug, tag.id);
    for (const [locale, label] of [["en", t.en], ["es", t.es]] as const) {
      await prisma.tagTranslation.upsert({
        where: { tagId_locale: { tagId: tag.id, locale } },
        update: { label },
        create: { tagId: tag.id, locale, label },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. Categorías
  // -------------------------------------------------------------------------
  const categoryMap = new Map<string, string>();
  for (const c of CATEGORIES) {
    const cat = await prisma.menuCategory.upsert({
      where: { businessId_slug: { businessId: business.id, slug: c.slug } },
      update: { sortOrder: c.sortOrder },
      create: { businessId: business.id, slug: c.slug, sortOrder: c.sortOrder },
    });
    categoryMap.set(c.slug, cat.id);
    for (const [locale, name] of [["en", c.en], ["es", c.es]] as const) {
      await prisma.menuCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: cat.id, locale } },
        update: { name },
        create: { categoryId: cat.id, locale, name },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. Platillos
  // -------------------------------------------------------------------------
  const dishMap = new Map<string, string>();
  for (const [i, d] of DISHES.entries()) {
    const item = await prisma.menuItem.upsert({
      where: { businessId_slug: { businessId: business.id, slug: d.slug } },
      update: { basePrice: D(d.price), isFeatured: d.featured, isAvailable: true, imageUrl: `/demo/${d.image}.jpg` },
      create: {
        businessId: business.id,
        categoryId: categoryMap.get(d.category)!,
        slug: d.slug,
        basePrice: D(d.price),
        isFeatured: d.featured,
        preparationMinutes: d.prep,
        sortOrder: i,
        // Las fotos de ejemplo viven en public/demo/ y se guardan como ruta
        // del mismo origen (lib/business/landing-images.ts, isBundledDemoImage).
        imageUrl: `/demo/${d.image}.jpg`,
      },
    });
    dishMap.set(d.slug, item.id);

    for (const [locale, tr] of [["en", d.en], ["es", d.es]] as const) {
      await prisma.menuItemTranslation.upsert({
        where: { menuItemId_locale: { menuItemId: item.id, locale } },
        update: { name: tr.name, description: tr.desc },
        create: {
          menuItemId: item.id,
          locale,
          name: tr.name,
          description: tr.desc,
          imageAlt: tr.name,
        },
      });
    }

    for (const tagSlug of d.tags) {
      const tagId = tagMap.get(tagSlug);
      if (!tagId) continue;
      await prisma.menuItemTag.upsert({
        where: { menuItemId_tagId: { menuItemId: item.id, tagId } },
        update: {},
        create: { menuItemId: item.id, tagId },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Modificadores — prueban el caso "tamaño" y el caso "extras"
  // -------------------------------------------------------------------------
  const sizeGroup = await prisma.modifierGroup.upsert({
    where: { businessId_slug: { businessId: business.id, slug: "size" } },
    update: {},
    create: {
      businessId: business.id,
      slug: "size",
      selectionType: "SINGLE",
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
    },
  });
  const extrasGroup = await prisma.modifierGroup.upsert({
    where: { businessId_slug: { businessId: business.id, slug: "extras" } },
    update: {},
    create: {
      businessId: business.id,
      slug: "extras",
      selectionType: "MULTIPLE",
      isRequired: false,
      minSelections: 0,
      maxSelections: 3,
    },
  });

  const groupLabels = [
    { g: sizeGroup, en: "Size", es: "Tamaño" },
    { g: extrasGroup, en: "Add-ons", es: "Extras" },
  ];
  for (const { g, en, es } of groupLabels) {
    for (const [locale, name] of [["en", en], ["es", es]] as const) {
      await prisma.modifierGroupTranslation.upsert({
        where: { groupId_locale: { groupId: g.id, locale } },
        update: { name },
        create: { groupId: g.id, locale, name },
      });
    }
  }

  const OPTIONS = [
    { group: sizeGroup.id, slug: "regular", delta: "0.00", isDefault: true, en: "Regular", es: "Normal" },
    { group: sizeGroup.id, slug: "large", delta: "20.00", isDefault: false, en: "Large", es: "Grande" },
    { group: extrasGroup.id, slug: "extra-avocado", delta: "35.00", isDefault: false, en: "Extra avocado", es: "Aguacate extra" },
    { group: extrasGroup.id, slug: "extra-lime", delta: "0.00", isDefault: false, en: "Extra lime", es: "Limón extra" },
    { group: extrasGroup.id, slug: "extra-shrimp", delta: "60.00", isDefault: false, en: "Extra shrimp", es: "Camarón extra" },
  ];
  for (const [i, o] of OPTIONS.entries()) {
    const opt = await prisma.modifierOption.upsert({
      where: { groupId_slug: { groupId: o.group, slug: o.slug } },
      update: { priceDelta: D(o.delta) },
      create: {
        groupId: o.group,
        slug: o.slug,
        priceDelta: D(o.delta),
        isDefault: o.isDefault,
        sortOrder: i,
      },
    });
    for (const [locale, name] of [["en", o.en], ["es", o.es]] as const) {
      await prisma.modifierOptionTranslation.upsert({
        where: { optionId_locale: { optionId: opt.id, locale } },
        update: { name },
        create: { optionId: opt.id, locale, name },
      });
    }
  }

  // Qué platillos aceptan qué grupos
  const withExtras = ["aguachile-verde", "tostada-de-atun", "tacos-gobernador"];
  for (const slug of withExtras) {
    await prisma.menuItemModifierGroup.upsert({
      where: { menuItemId_groupId: { menuItemId: dishMap.get(slug)!, groupId: extrasGroup.id } },
      update: {},
      create: { menuItemId: dishMap.get(slug)!, groupId: extrasGroup.id, sortOrder: 1 },
    });
  }
  await prisma.menuItemModifierGroup.upsert({
    where: { menuItemId_groupId: { menuItemId: dishMap.get("agua-de-jamaica")!, groupId: sizeGroup.id } },
    update: {},
    create: { menuItemId: dishMap.get("agua-de-jamaica")!, groupId: sizeGroup.id, sortOrder: 0 },
  });

  // -------------------------------------------------------------------------
  // 7. Mesas + QR
  // -------------------------------------------------------------------------
  const zones = [
    { zone: "Salón principal", count: 6, seats: 4 },
    { zone: "Terraza", count: 4, seats: 2 },
    { zone: "Barra", count: 2, seats: 6 },
  ];
  const tableIds: string[] = [];
  let n = 1;
  for (const z of zones) {
    for (let i = 0; i < z.count; i++) {
      const code = `M-${String(n).padStart(2, "0")}`;
      const t = await prisma.restaurantTable.upsert({
        where: { businessId_code: { businessId: business.id, code } },
        update: {},
        create: {
          businessId: business.id,
          code,
          zone: z.zone,
          seats: z.seats,
          sortOrder: n,
        },
      });
      tableIds.push(t.id);
      n++;
    }
  }

  // -------------------------------------------------------------------------
  // 8. Promociones
  // -------------------------------------------------------------------------
  const PROMOS = [
    {
      slug: "martes-de-aguachile",
      type: "PERCENTAGE" as const,
      value: "50.00",
      days: [2], // martes
      items: ["aguachile-verde"],
      orderType: "DINE_IN" as const,
      sortOrder: 1,
      en: { title: "Aguachile Tuesday", badge: "50% OFF", desc: "Green aguachile at half price every Tuesday when you dine in." },
      es: { title: "Martes de Aguachile", badge: "50% DESC.", desc: "Aguachile verde a mitad de precio todos los martes, comiendo en el restaurante." },
    },
    {
      slug: "zarandeado-con-jamaica",
      type: "BUNDLE_PRICE" as const,
      value: "499.00",
      days: [] as number[],
      items: ["pescado-zarandeado", "agua-de-jamaica"],
      orderType: null,
      sortOrder: 2,
      en: { title: "Zarandeado for the Table", badge: "$499", desc: "A whole zarandeado fish to share, with an hibiscus agua fresca." },
      es: { title: "Zarandeado para la Mesa", badge: "$499", desc: "Un pescado zarandeado entero para compartir, con agua de jamaica." },
    },
    {
      slug: "tostada-y-michelada",
      type: "BUNDLE_PRICE" as const,
      value: "249.00",
      days: [] as number[],
      items: ["tostada-de-atun", "michelada"],
      orderType: null,
      sortOrder: 3,
      en: { title: "Tostada & Michelada", badge: "$249", desc: "A tuna tostada and an ice-cold michelada, for the afternoon." },
      es: { title: "Tostada y Michelada", badge: "$249", desc: "Una tostada de atún y una michelada bien fría, para la tarde." },
    },
    {
      slug: "fin-de-semana-para-llevar",
      type: "PERCENTAGE" as const,
      value: "15.00",
      days: [5, 6, 0], // viernes, sábado, domingo
      items: [] as string[],
      orderType: "TAKEAWAY" as const,
      sortOrder: 4,
      en: { title: "Weekend Takeaway", badge: "15% OFF", desc: "15% off your whole order to go, Friday through Sunday." },
      es: { title: "Fin de Semana para Llevar", badge: "15% DESC.", desc: "15% en todo tu pedido para llevar, de viernes a domingo." },
    },
  ];

  for (const p of PROMOS) {
    const promo = await prisma.promotion.upsert({
      where: { businessId_slug: { businessId: business.id, slug: p.slug } },
      update: {},
      create: {
        businessId: business.id,
        slug: p.slug,
        type: p.type,
        value: D(p.value),
        daysOfWeek: p.days,
        isActive: true,
        isFeatured: true,
        sortOrder: p.sortOrder,
        appliesToOrderType: p.orderType,
      },
    });
    for (const [locale, tr] of [["en", p.en], ["es", p.es]] as const) {
      await prisma.promotionTranslation.upsert({
        where: { promotionId_locale: { promotionId: promo.id, locale } },
        update: { title: tr.title, description: tr.desc, badgeLabel: tr.badge },
        create: {
          promotionId: promo.id,
          locale,
          title: tr.title,
          description: tr.desc,
          badgeLabel: tr.badge,
        },
      });
    }
    for (const slug of p.items) {
      await prisma.promotionMenuItem.upsert({
        where: { promotionId_menuItemId: { promotionId: promo.id, menuItemId: dishMap.get(slug)! } },
        update: {},
        create: { promotionId: promo.id, menuItemId: dishMap.get(slug)! },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 9. Testimonios (los 6 del landing, aprobados y destacados)
  // -------------------------------------------------------------------------
  for (const [i, t] of TESTIMONIALS.entries()) {
    const existing = await prisma.testimonial.findFirst({
      where: { businessId: business.id, authorName: t.name },
    });
    const tm =
      existing ??
      (await prisma.testimonial.create({
        data: {
          businessId: business.id,
          authorName: t.name,
          rating: 5,
          status: "APPROVED",
          isFeatured: true,
          sortOrder: i,
          sourceLocale: t.sourceLocale,
        },
      }));
    for (const [locale, quote] of [["en", t.en], ["es", t.es]] as const) {
      await prisma.testimonialTranslation.upsert({
        where: { testimonialId_locale: { testimonialId: tm.id, locale } },
        update: { quote },
        create: { testimonialId: tm.id, locale, quote },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 10. Pedidos de ejemplo — uno por estado, para probar el tablero de cocina
  // -------------------------------------------------------------------------
  const scenarios = [
    { number: "A-0001", status: "PENDING" as const, type: "DINE_IN" as const, table: 0, items: [["aguachile-verde", 1], ["agua-de-jamaica", 2]] },
    { number: "A-0002", status: "PREPARING" as const, type: "DINE_IN" as const, table: 2, items: [["pescado-zarandeado", 1], ["michelada", 2]] },
    { number: "A-0003", status: "READY" as const, type: "TAKEAWAY" as const, table: null, items: [["tacos-gobernador", 2]] },
    { number: "A-0004", status: "DELIVERED" as const, type: "DINE_IN" as const, table: 5, items: [["pulpo-a-las-brasas", 1], ["pay-de-limon", 2]] },
    { number: "A-0005", status: "CANCELLED" as const, type: "TAKEAWAY" as const, table: null, items: [["coctel-de-camaron", 1]] },
  ];

  for (const s of scenarios) {
    const exists = await prisma.order.findUnique({
      where: { businessId_orderNumber: { businessId: business.id, orderNumber: s.number } },
    });
    if (exists) continue;

    const lines = s.items.map(([slug, qty]) => {
      const dish = DISHES.find((d) => d.slug === slug)!;
      const unit = D(dish.price);
      return {
        menuItemId: dishMap.get(slug as string)!,
        nameSnapshot: dish.es.name,
        unitPrice: unit,
        quantity: qty as number,
        lineTotal: unit.mul(qty as number),
      };
    });
    const subtotal = lines.reduce((a, l) => a.add(l.lineTotal), D("0"));
    const tax = subtotal.mul(business.taxRate).toDecimalPlaces(2);

    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        orderNumber: s.number,
        type: s.type,
        status: s.status,
        customerId: customer.id,
        staffId: s.type === "DINE_IN" ? waiter.id : null,
        tableId: s.table !== null ? tableIds[s.table] : null,
        guestName: customer.name,
        guestEmail: customer.email,
        guestCount: s.type === "DINE_IN" ? 2 : null,
        subtotal,
        taxTotal: tax,
        total: subtotal.add(tax),
        currency: business.currency,
        readyAt: ["READY", "DELIVERED"].includes(s.status) ? new Date() : null,
        completedAt: s.status === "DELIVERED" ? new Date() : null,
        cancelledAt: s.status === "CANCELLED" ? new Date() : null,
        cancellationReason: s.status === "CANCELLED" ? "Cliente cambió de opinión" : null,
        items: { create: lines },
        // Historial de estados: siempre existe al menos el evento inicial.
        statusEvents: {
          create: [
            { toStatus: "PENDING", changedById: customer.id },
            ...(s.status !== "PENDING"
              ? [{ fromStatus: "PENDING" as const, toStatus: s.status, changedById: admin.id }]
              : []),
          ],
        },
      },
    });

    // Pagos: uno con Stripe exitoso, otro pendiente en caja.
    if (s.status === "DELIVERED") {
      await prisma.payment.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          provider: "STRIPE",
          status: "SUCCEEDED",
          amount: order.total,
          currency: business.currency,
          stripePaymentIntentId: `pi_seed_${order.orderNumber}`,
          paymentMethodBrand: "visa",
          paymentMethodLast4: "4242",
          paidAt: new Date(),
        },
      });
    } else if (s.status !== "CANCELLED") {
      await prisma.payment.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          provider: "CASH_REGISTER",
          status: "PENDING",
          amount: order.total,
          currency: business.currency,
        },
      });
    }
  }

  // The scenarios above use the legacy "A-0001".."A-0005" folios. Orders
  // placed later get "A-YYMMDD-NNN" numbers from OrderCounter, a format that
  // cannot equal a legacy one, so there is no counter to keep in sync here.

  // -------------------------------------------------------------------------
  // 11. Reservaciones — cubren solapamiento y estados
  // -------------------------------------------------------------------------
  const base = new Date();
  base.setHours(19, 0, 0, 0);
  const RESERVATIONS = [
    { name: "Ana Villalobos", party: 2, offsetDays: 1, table: 0, status: "CONFIRMED" as const },
    { name: "Luis Moreno", party: 4, offsetDays: 1, table: 3, status: "PENDING" as const },
    { name: "Paula Rentería", party: 6, offsetDays: 2, table: 10, status: "CONFIRMED" as const },
    { name: "Héctor Salas", party: 2, offsetDays: -1, table: 1, status: "NO_SHOW" as const },
  ];
  for (const r of RESERVATIONS) {
    const start = new Date(base);
    start.setDate(start.getDate() + r.offsetDays);
    const exists = await prisma.reservation.findFirst({
      where: { businessId: business.id, guestName: r.name, reservedFor: start },
    });
    if (exists) continue;
    await prisma.reservation.create({
      data: {
        businessId: business.id,
        tableId: tableIds[r.table],
        guestName: r.name,
        guestEmail: `${r.name.split(" ")[0].toLowerCase()}@example.com`,
        guestPhone: "+52 669 000 0000",
        partySize: r.party,
        reservedFor: start,
        durationMinutes: 90,
        // endsAt se guarda explícitamente: la app SIEMPRE debe calcularlo.
        endsAt: new Date(start.getTime() + 90 * 60 * 1000),
        status: r.status,
        confirmedAt: r.status === "CONFIRMED" ? new Date() : null,
        notes: r.party > 4 ? "Cumpleaños — pastel al final" : null,
      },
    });
  }

  await seedSecondBusiness(business);

  // Seis semanas de historia, para que los reportes, el corte de caja y la
  // agenda no se vean vacíos (prisma/seed-history.ts). Sólo la primera vez.
  const cala = await prisma.business.findUniqueOrThrow({ where: { slug: "cala" }, select: { id: true } });
  const mareaHistory = await seedHistory(prisma, business.id, { days: 42, ordersPerDay: 28, reservationsPerDay: 9, daysAhead: 14 });
  const calaHistory = await seedHistory(prisma, cala.id, { days: 42, ordersPerDay: 34, reservationsPerDay: 0, daysAhead: 0 });

  console.log("✅ Seed listo:");
  console.log(`   ${CATEGORIES.length} categorías · ${DISHES.length} platillos · ${PROMOS.length} promociones`);
  console.log(`   ${TESTIMONIALS.length} testimonios · ${tableIds.length} mesas · ${scenarios.length} pedidos · ${RESERVATIONS.length} reservaciones`);
  console.log("   + Cala (misma cadena, Marea Group): 2 categorías · 4 platillos · 4 mesas · 1 pedido");
  if (mareaHistory) console.log(`   + historia de Marea: ${mareaHistory.orders} pedidos · ${mareaHistory.reservations} reservaciones`);
  if (calaHistory) console.log(`   + historia de Cala: ${calaHistory.orders} pedidos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
