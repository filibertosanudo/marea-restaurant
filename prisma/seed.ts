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
import { safeHostname } from "../lib/url";

// Contraseñas de desarrollo para el personal sembrado — documentadas en el
// README. Nunca uses estos valores fuera de un entorno local.
const DEV_PASSWORDS: Record<string, string> = {
  "super@marea.test": "MareaSuper123!",
  "admin@marea.test": "MareaAdmin123!",
  "mesero@marea.test": "MareaTemp123!", // mustChangePassword: true — ver abajo
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
// Catálogo, copiado 1:1 de content.ts (STR.en / STR.es)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { slug: "starters", sortOrder: 1, en: "Starters", es: "Entradas" },
  { slug: "soups", sortOrder: 2, en: "Soups & Salads", es: "Sopas y Ensaladas" },
  { slug: "mains", sortOrder: 3, en: "Main Dishes", es: "Platos Fuertes" },
  { slug: "sides", sortOrder: 4, en: "Side Dishes", es: "Guarniciones" },
  { slug: "desserts", sortOrder: 5, en: "Desserts", es: "Postres" },
  { slug: "beverages", sortOrder: 6, en: "Beverages", es: "Bebidas" },
];

const DISHES = [
  {
    slug: "oyster-sampler",
    category: "starters",
    price: "16.00",
    featured: false,
    prep: 10,
    tags: ["shellfish", "gluten-free"],
    en: {
      name: "Oyster Sampler",
      desc: "A chilled selection of six oysters on the half shell with mignonette and fresh lemon.",
    },
    es: {
      name: "Ostras Surtidas",
      desc: "Una selección fría de seis ostras en su concha con mignonette y limón fresco.",
    },
  },
  {
    slug: "lobster-bisque",
    category: "soups",
    price: "14.00",
    featured: false,
    prep: 12,
    tags: ["shellfish"],
    en: {
      name: "Lobster Bisque",
      desc: "Velvety lobster bisque finished with a touch of cream and cognac.",
    },
    es: {
      name: "Bisque de Langosta",
      desc: "Bisque de langosta aterciopelada con un toque de crema y coñac.",
    },
  },
  {
    slug: "lobster-thermidor",
    category: "mains",
    price: "42.00",
    featured: true,
    prep: 30,
    tags: ["shellfish", "chefs-choice"],
    en: {
      name: "Lobster Thermidor",
      desc: "Grilled lobster tail with creamy mustard sauce, Parmesan cheese, and garlic butter, served with truffle mashed potatoes.",
    },
    es: {
      name: "Langosta Thermidor",
      desc: "Cola de langosta a la parrilla con cremosa salsa de mostaza, queso parmesano y mantequilla de ajo, con puré de papa trufado.",
    },
  },
  {
    slug: "seared-chilean-sea-bass",
    category: "mains",
    price: "38.00",
    featured: true,
    prep: 25,
    tags: ["gluten-free"],
    en: {
      name: "Seared Chilean Sea Bass",
      desc: "Tender Chilean sea bass fillet, seared to perfection, with lemon butter sauce, sautéed asparagus, and wild rice.",
    },
    es: {
      name: "Róbalo Chileno Sellado",
      desc: "Filete de róbalo chileno sellado a la perfección, con salsa de mantequilla al limón, espárragos salteados y arroz salvaje.",
    },
  },
  {
    slug: "seafood-paella-royale",
    category: "mains",
    price: "36.00",
    featured: true,
    prep: 35,
    tags: ["shellfish"],
    en: {
      name: "Seafood Paella Royale",
      desc: "Saffron-infused Spanish rice with jumbo shrimp, mussels, calamari and chorizo, garnished with fresh herbs.",
    },
    es: {
      name: "Paella de Mariscos Royale",
      desc: "Arroz español al azafrán con camarón jumbo, mejillones, calamar y chorizo, decorado con hierbas frescas.",
    },
  },
  {
    slug: "garlic-butter-crab-legs",
    category: "mains",
    price: "48.00",
    featured: true,
    prep: 28,
    tags: ["shellfish", "chefs-choice"],
    en: {
      name: "Garlic Butter Crab Legs",
      desc: "Juicy Alaskan king crab legs, drenched in garlic butter sauce, served with grilled corn and herb-roasted potatoes.",
    },
    es: {
      name: "Patas de Cangrejo al Ajo",
      desc: "Jugosas patas de cangrejo real de Alaska bañadas en mantequilla de ajo, con elote a la parrilla y papas a las hierbas.",
    },
  },
  {
    slug: "garlic-herb-fries",
    category: "sides",
    price: "9.00",
    featured: false,
    prep: 8,
    tags: ["vegetarian"],
    en: {
      name: "Garlic Herb Fries",
      desc: "Crispy fries tossed in garlic butter and fresh herbs.",
    },
    es: {
      name: "Papas al Ajo y Hierbas",
      desc: "Papas crujientes bañadas en mantequilla de ajo y hierbas frescas.",
    },
  },
  {
    slug: "key-lime-tart",
    category: "desserts",
    price: "10.00",
    featured: false,
    prep: 5,
    tags: ["vegetarian"],
    en: {
      name: "Key Lime Tart",
      desc: "Tangy key lime custard on a buttery graham crust.",
    },
    es: {
      name: "Tarta de Limón",
      desc: "Cremoso de limón agrio sobre una base de galleta amantequillada.",
    },
  },
  {
    slug: "citrus-spritz",
    category: "beverages",
    price: "8.00",
    featured: false,
    prep: 4,
    tags: ["non-alcoholic", "vegan"],
    en: {
      name: "Citrus Spritz",
      desc: "A refreshing non-alcoholic spritz with citrus and mint.",
    },
    es: {
      name: "Spritz Cítrico",
      desc: "Un refrescante spritz sin alcohol con cítricos y menta.",
    },
  },
];

const TAGS = [
  { slug: "shellfish", en: "Shellfish", es: "Crustáceos", color: "#e07a5f" },
  { slug: "gluten-free", en: "Gluten free", es: "Sin gluten", color: "#81b29a" },
  { slug: "vegetarian", en: "Vegetarian", es: "Vegetariano", color: "#6a994e" },
  { slug: "vegan", en: "Vegan", es: "Vegano", color: "#386641" },
  { slug: "non-alcoholic", en: "Non-alcoholic", es: "Sin alcohol", color: "#3d5a80" },
  { slug: "chefs-choice", en: "Chef's choice", es: "Sugerencia del chef", color: "#f2cc8f" },
];

const TESTIMONIALS = [
  {
    name: "Elena Petrenko",
    en: "The freshest seafood I've had — the ambiance matched the flavor perfectly.",
    es: "El marisco más fresco que he probado — el ambiente igualó al sabor a la perfección.",
  },
  {
    name: "Andriy Kovalenko",
    en: "Every dish tastes like it came straight from the ocean.",
    es: "Cada platillo sabe como si viniera directo del océano.",
  },
  {
    name: "Marco Dubois",
    en: "This place redefined what I thought seafood could taste like — impeccable freshness in every bite.",
    es: "Este lugar redefinió lo que pensaba que podía saber el marisco — frescura impecable en cada bocado.",
  },
  {
    name: "Sofia Ramirez",
    en: "The lobster thermidor alone is worth the trip. Service was warm and attentive all night.",
    es: "La langosta thermidor por sí sola vale el viaje. El servicio fue cálido y atento toda la noche.",
  },
  {
    name: "James Whitfield",
    en: "A true gem by the water — the paella rivals anything I've had on the coast of Spain.",
    es: "Una verdadera joya junto al mar — la paella rivaliza con cualquiera que haya probado en la costa de España.",
  },
  {
    name: "Nadia Osei",
    en: "From the oysters to the dessert, everything felt thoughtfully crafted. We'll be back.",
    es: "Desde las ostras hasta el postre, todo se sintió cuidadosamente elaborado. Volveremos.",
  },
];

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
      defaultLocale: "en",
      supportedLocales: ["en", "es"],
      currency: "USD", // el landing muestra precios en USD
      timezone: "America/Hermosillo",
      taxRate: D("0.0800"),
      email: "hola@marea.test",
      phone: "+1 555 000 0000",
      addressLine1: "142 Harbour Pier Road",
      addressLine2: "Marina District, Portside 90210",
      acceptsOnlinePayment: true,
      acceptsPayAtCounter: true,
    },
  });

  await Promise.all([
    prisma.businessTranslation.upsert({
      where: { businessId_locale: { businessId: business.id, locale: "en" } },
      update: {},
      create: {
        businessId: business.id,
        locale: "en",
        tagline: "Fresh from the ocean, every day.",
        shortBlurb:
          "Boutique seafood, sourced daily from local waters and served by the sea.",
        aboutTitle: "Fresh from local waters, daily.",
        aboutBody:
          "Fresh, delicately prepared seafood sourced daily from local waters.",
        metaTitle: "Marea — Boutique Seafood",
        metaDescription:
          "Dive into freshness — an ocean of flavors awaits at our restaurant.",
      },
    }),
    prisma.businessTranslation.upsert({
      where: { businessId_locale: { businessId: business.id, locale: "es" } },
      update: {},
      create: {
        businessId: business.id,
        locale: "es",
        tagline: "Frescura del océano, todos los días.",
        shortBlurb:
          "Mariscos boutique, obtenidos a diario de aguas locales y servidos junto al mar.",
        aboutTitle: "Frescura de aguas locales, cada día.",
        aboutBody:
          "Mariscos frescos y delicadamente preparados, obtenidos a diario de aguas locales.",
        metaTitle: "Marea — Mariscos Boutique",
        metaDescription:
          "Sumérgete en la frescura — un océano de sabores te espera en nuestro restaurante.",
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
      update: { basePrice: D(d.price), isFeatured: d.featured, isAvailable: true },
      create: {
        businessId: business.id,
        categoryId: categoryMap.get(d.category)!,
        slug: d.slug,
        basePrice: D(d.price),
        isFeatured: d.featured,
        preparationMinutes: d.prep,
        sortOrder: i,
        imageUrl: `/menu/${d.slug}.jpg`,
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
    { group: sizeGroup.id, slug: "large", delta: "6.00", isDefault: false, en: "Large", es: "Grande" },
    { group: extrasGroup.id, slug: "extra-butter", delta: "2.00", isDefault: false, en: "Extra garlic butter", es: "Mantequilla de ajo extra" },
    { group: extrasGroup.id, slug: "extra-lemon", delta: "0.00", isDefault: false, en: "Extra lemon", es: "Limón extra" },
    { group: extrasGroup.id, slug: "truffle-upgrade", delta: "8.00", isDefault: false, en: "Truffle upgrade", es: "Con trufa" },
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
  const withExtras = ["lobster-thermidor", "garlic-butter-crab-legs", "seafood-paella-royale"];
  for (const slug of withExtras) {
    await prisma.menuItemModifierGroup.upsert({
      where: { menuItemId_groupId: { menuItemId: dishMap.get(slug)!, groupId: extrasGroup.id } },
      update: {},
      create: { menuItemId: dishMap.get(slug)!, groupId: extrasGroup.id, sortOrder: 1 },
    });
  }
  await prisma.menuItemModifierGroup.upsert({
    where: { menuItemId_groupId: { menuItemId: dishMap.get("citrus-spritz")!, groupId: sizeGroup.id } },
    update: {},
    create: { menuItemId: dishMap.get("citrus-spritz")!, groupId: sizeGroup.id, sortOrder: 0 },
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
  // 8. Promociones — las 4 que hoy están hardcodeadas en `offers`
  // -------------------------------------------------------------------------
  const PROMOS = [
    {
      slug: "champagne-oysters-set",
      type: "BUNDLE_PRICE" as const,
      value: "39.00",
      days: [] as number[],
      items: ["oyster-sampler"],
      sortOrder: 1,
      en: { title: "Champagne & Oysters Set", badge: "$39", desc: "6 fresh oysters paired with a glass of premium champagne." },
      es: { title: "Set de Champagne y Ostras", badge: "$39", desc: "6 ostras frescas acompañadas de una copa de champagne premium." },
    },
    {
      slug: "lobster-night",
      type: "PERCENTAGE" as const,
      value: "50.00",
      days: [4], // jueves
      items: ["lobster-thermidor"],
      sortOrder: 2,
      en: { title: "Lobster Night", badge: "50% OFF", desc: "50% off on our signature Lobster Thermidor when you dine in on Thursdays." },
      es: { title: "Noche de Langosta", badge: "50% DESC.", desc: "50% de descuento en nuestra Langosta Thermidor al cenar los jueves." },
    },
    {
      slug: "seafood-lovers-platter",
      type: "BUNDLE_PRICE" as const,
      value: "59.00",
      days: [],
      items: ["garlic-butter-crab-legs", "seafood-paella-royale"],
      sortOrder: 3,
      en: { title: "Seafood Lovers' Platter", badge: "$59 (for 2)", desc: "An exquisite mix of lobster, prawns, mussels and calamari, served with garlic butter sauce." },
      es: { title: "Tabla para Amantes del Mar", badge: "$59 (para 2)", desc: "Una exquisita mezcla de langosta, camarón, mejillones y calamar, con salsa de mantequilla de ajo." },
    },
    {
      slug: "sushi-sashimi-weekend",
      type: "PERCENTAGE" as const,
      value: "20.00",
      days: [5, 6, 0], // viernes, sábado, domingo
      items: [],
      sortOrder: 4,
      en: { title: "Sushi & Sashimi Weekend", badge: "20% OFF", desc: "Enjoy a selection of fresh sushi and sashimi every Friday–Sunday at a special discount." },
      es: { title: "Fin de Semana de Sushi", badge: "20% DESC.", desc: "Disfruta una selección de sushi y sashimi frescos de viernes a domingo a precio especial." },
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
        appliesToOrderType: p.slug === "lobster-night" ? "DINE_IN" : null,
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
          sourceLocale: "en",
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
    { number: "A-0001", status: "PENDING" as const, type: "DINE_IN" as const, table: 0, items: [["oyster-sampler", 1], ["citrus-spritz", 2]] },
    { number: "A-0002", status: "PREPARING" as const, type: "DINE_IN" as const, table: 2, items: [["lobster-thermidor", 2], ["garlic-herb-fries", 1]] },
    { number: "A-0003", status: "READY" as const, type: "TAKEAWAY" as const, table: null, items: [["seafood-paella-royale", 1]] },
    { number: "A-0004", status: "DELIVERED" as const, type: "DINE_IN" as const, table: 5, items: [["garlic-butter-crab-legs", 1], ["key-lime-tart", 2]] },
    { number: "A-0005", status: "CANCELLED" as const, type: "TAKEAWAY" as const, table: null, items: [["lobster-bisque", 1]] },
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
        nameSnapshot: dish.en.name,
        unitPrice: unit,
        quantity: qty as number,
        lineTotal: unit.mul(qty as number),
      };
    });
    const subtotal = lines.reduce((a, l) => a.add(l.lineTotal), D("0"));
    const tax = subtotal.mul(D("0.08")).toDecimalPlaces(2);

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
        currency: "USD",
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
          currency: "USD",
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
          currency: "USD",
        },
      });
    }
  }

  // The scenarios above insert orderNumber directly (A-0001..A-0005)
  // instead of going through orderSequence's atomic increment — keep the
  // counter in sync so the first real order placed after seeding doesn't
  // collide with a folio the seed already used.
  const businessAfterSeedOrders = await prisma.business.findUniqueOrThrow({
    where: { id: business.id },
    select: { orderSequence: true },
  });
  if (businessAfterSeedOrders.orderSequence < scenarios.length) {
    await prisma.business.update({
      where: { id: business.id },
      data: { orderSequence: scenarios.length },
    });
  }

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
        guestPhone: "+52 662 000 0000",
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

  console.log("✅ Seed listo:");
  console.log(`   ${CATEGORIES.length} categorías · ${DISHES.length} platillos · ${PROMOS.length} promociones`);
  console.log(`   ${TESTIMONIALS.length} testimonios · ${tableIds.length} mesas · ${scenarios.length} pedidos · ${RESERVATIONS.length} reservaciones`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
