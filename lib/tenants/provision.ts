import { createId } from "@paralleldrive/cuid2";
import type { PrismaClient, Business, Organization, User } from "@/lib/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporary-password";
import { validateSlug } from "@/lib/business-host";
import { runWithoutTenant } from "@/lib/tenancy/context";
import { signupSqlError } from "@/lib/tenants/signup-errors";

/**
 * Creating organizations, businesses and their first administrators, without
 * anyone opening the database by hand (scripts/tenants.ts is the command line
 * over this).
 *
 * These write rows the running application is not allowed to write (it can
 * read an organization and cannot create a business: see the row level
 * security migrations), so they run with the owner's connection. Each takes the
 * client as an argument for that reason, and for tests.
 */
type Db = Pick<PrismaClient, "organization" | "business" | "businessTranslation" | "user" | "businessMembership" | "$transaction">;

export class ProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionError";
  }
}

function assertSlug(kind: string, slug: string): void {
  const problem = validateSlug(slug);
  if (problem) throw new ProvisionError(`${kind} slug "${slug}": ${problem}`);
}

function assertEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ProvisionError(`"${email}" is not an email address`);
}

async function organizationBySlug(db: Db, slug: string): Promise<Organization> {
  const organization = await db.organization.findUnique({ where: { slug } });
  if (!organization) throw new ProvisionError(`No organization "${slug}". Create it first (create-organization).`);
  return organization;
}

export async function createOrganization(db: Db, input: { name: string; slug: string }): Promise<Organization> {
  assertSlug("Organization", input.slug);
  if (await db.organization.findUnique({ where: { slug: input.slug } })) {
    throw new ProvisionError(`Organization "${input.slug}" already exists.`);
  }
  return db.organization.create({ data: { name: input.name, slug: input.slug } });
}

export type NewBusiness = {
  slug: string;
  name: string;
  /** The chain this business joins. Always required: a business with no
   * organization is created only by signUp() below, which gives it a new
   * one of its own — this function is for adding a branch to a chain that
   * already exists. */
  organizationSlug: string;
  timezone?: string;
  currency?: string;
  defaultLocale?: "en" | "es";
};

/**
 * A business ready to be configured: its row, both language versions of its
 * texts (blank taglines the admin fills in) and nothing else. Its menu, tables
 * and hours are the new administrator's to set up, or copied from a sister
 * branch in the panel. Card payments start OFF: with more than one business on
 * a deployment a business needs a Stripe account of its own first (module 17b).
 *
 * Owner-connection only, same as createOrganization — row level security
 * gives marea_app no INSERT policy on Business at all. Adding a branch from
 * inside the app (module 19, phase 7) needs a narrower SECURITY DEFINER
 * primitive that checks the caller's own business against the target
 * organization; until that exists, growing a chain is done from here, by
 * the platform operator.
 */
export async function createBusiness(db: Db, input: NewBusiness): Promise<Business> {
  assertSlug("Business", input.slug);
  if (await db.business.findUnique({ where: { slug: input.slug } })) {
    throw new ProvisionError(`Business "${input.slug}" already exists.`);
  }
  const organization = await organizationBySlug(db, input.organizationSlug);
  const defaultLocale = input.defaultLocale ?? "es";

  return db.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        slug: input.slug,
        name: input.name,
        defaultLocale,
        supportedLocales: ["en", "es"],
        ...(input.timezone ? { timezone: input.timezone } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        acceptsOnlinePayment: false,
        organizationId: organization.id,
      },
    });
    for (const locale of ["en", "es"]) {
      await tx.businessTranslation.create({ data: { businessId: business.id, locale } });
    }
    return business;
  });
}

export type NewSignup = { slug: string; name: string };
export type SignedUp = { organizationId: string; businessId: string };

/**
 * A business with a brand-new organization of its own — the only shape
 * signing up ever creates (module 19: every business belongs to an
 * organization, even a chain of one, and that organization is never shown
 * to the user as such when there's only one business in it).
 *
 * Goes through marea_signup(), the one SECURITY DEFINER door into
 * Organization/Business for a connection that is not the database owner.
 * scripts/tenants.ts calls this same function for its own "no --organization
 * given" case, so there is one way to create a fresh business, not two that
 * can drift apart: see the migration's own header for the function's exact
 * contract (what it validates in the database, not just in TypeScript).
 *
 * The ids are generated here, not by the database: a hand-written INSERT
 * has no Prisma default to fall back on for a cuid() column, so this uses
 * the same generator lib/tables/actions.ts already reaches for when it needs
 * one outside a Prisma .create() call.
 */
export async function signUp(db: Pick<PrismaClient, "$executeRaw">, input: NewSignup): Promise<SignedUp> {
  assertSlug("Business", input.slug);
  const organizationId = createId();
  const businessId = createId();
  const translationIdEn = createId();
  const translationIdEs = createId();

  try {
    await runWithoutTenant(
      () =>
        db.$executeRaw`SELECT marea_signup(${organizationId}, ${businessId}, ${input.slug}, ${input.name}, ${translationIdEn}, ${translationIdEs})`
    );
  } catch (err) {
    const reason = signupSqlError(err);
    if (reason === "slug_taken") throw new ProvisionError(`Business "${input.slug}" already exists.`);
    if (reason === "invalid_slug") throw new ProvisionError(`Business slug "${input.slug}": use 1 to 32 lowercase letters, digits and inner hyphens`);
    if (reason === "reserved_slug") throw new ProvisionError(`Business slug "${input.slug}": that name is reserved`);
    throw err;
  }

  return { organizationId, businessId };
}

export type Provisioned = { user: User; temporaryPassword: string };

/** The first BUSINESS_ADMIN of a business, with a temporary password shown once and a forced change at first sign-in. */
export async function createBusinessAdmin(
  db: Db,
  input: { businessSlug: string; email: string; name: string }
): Promise<Provisioned> {
  assertEmail(input.email);
  const business = await db.business.findUnique({ where: { slug: input.businessSlug } });
  if (!business) throw new ProvisionError(`No business "${input.businessSlug}".`);
  if (await db.user.findUnique({ where: { email: input.email } })) {
    throw new ProvisionError(`"${input.email}" already has an account.`);
  }

  const temporaryPassword = generateTemporaryPassword();
  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      // A platform role of CUSTOMER: the real role lives on the membership.
      role: "CUSTOMER",
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      memberships: { create: { businessId: business.id, role: "BUSINESS_ADMIN", isActive: true } },
    },
  });
  return { user, temporaryPassword };
}

/** The owner of a chain: ORG_ADMIN on their organization, no memberships. */
export async function createOrgAdmin(
  db: Db,
  input: { organizationSlug: string; email: string; name: string }
): Promise<Provisioned> {
  assertEmail(input.email);
  const organization = await organizationBySlug(db, input.organizationSlug);
  if (await db.user.findUnique({ where: { email: input.email } })) {
    throw new ProvisionError(`"${input.email}" already has an account.`);
  }

  const temporaryPassword = generateTemporaryPassword();
  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: "ORG_ADMIN",
      organizationId: organization.id,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    },
  });
  return { user, temporaryPassword };
}

/** Puts a standalone business into an organization (or moves it): the owner sees it from their next sign-in check. */
export async function assignBusinessToOrganization(
  db: Db,
  input: { businessSlug: string; organizationSlug: string }
): Promise<Business> {
  const [business, organization] = await Promise.all([
    db.business.findUnique({ where: { slug: input.businessSlug } }),
    organizationBySlug(db, input.organizationSlug),
  ]);
  if (!business) throw new ProvisionError(`No business "${input.businessSlug}".`);
  return db.business.update({ where: { id: business.id }, data: { organizationId: organization.id } });
}

export type TenantListing = {
  organizations: Array<{ slug: string; name: string; businesses: Array<{ slug: string; name: string }> }>;
  standalone: Array<{ slug: string; name: string }>;
};

export async function listTenants(db: Pick<PrismaClient, "organization" | "business">): Promise<TenantListing> {
  const [organizations, standalone] = await Promise.all([
    db.organization.findMany({
      orderBy: { name: "asc" },
      select: { slug: true, name: true, businesses: { where: { deletedAt: null }, orderBy: { name: "asc" }, select: { slug: true, name: true } } },
    }),
    db.business.findMany({
      where: { organizationId: null, deletedAt: null },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);
  return { organizations, standalone };
}

