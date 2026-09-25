/**
 * Creates and lists organizations, businesses and their first administrators,
 * so onboarding a business never means opening the database by hand.
 *
 *   npm run tenants -- list
 *   npm run tenants -- create-organization --slug marea-group --name "Marea Group"
 *   npm run tenants -- create-business --slug cala --name Cala --organization marea-group \
 *       [--timezone America/Hermosillo] [--currency MXN] [--locale es|en] \
 *       [--admin-email ana@cala.mx --admin-name "Ana Cota"]
 *   npm run tenants -- create-org-admin --organization marea-group --email dueno@marea.mx --name "Dueño"
 *   npm run tenants -- assign-business --slug cala --organization marea-group
 *
 * It writes rows the running application cannot (it may read an organization,
 * not create a business), so it needs the OWNER's connection: DIRECT_URL, else
 * DATABASE_URL, the same the migrations use. Pointed at the application role
 * it refuses rather than fail halfway. In Docker Compose:
 *
 *   docker compose run --rm --entrypoint "" migrate npx tsx scripts/tenants.ts list
 *
 * A temporary password is printed ONCE, on this terminal only; the person is
 * made to change it at first sign-in.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { findRoleProblem } from "../lib/db/role-check";
import { originFor } from "../lib/business-host";
import {
  ProvisionError,
  assignBusinessToOrganization,
  createBusiness,
  createBusinessAdmin,
  createOrgAdmin,
  createOrganization,
  listTenants,
  type NewBusiness,
} from "../lib/tenants/provision";

function flags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) throw new ProvisionError(`Unexpected argument "${arg}".`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new ProvisionError(`${arg} needs a value.`);
    out[arg.slice(2)] = value;
    i++;
  }
  return out;
}

function required(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (!value) throw new ProvisionError(`--${name} is required.`);
  return value;
}

function businessUrl(slug: string): string {
  const appOrigin = process.env.APP_ORIGIN ?? process.env.AUTH_URL ?? "http://localhost:3000";
  return originFor(slug, appOrigin.replace(/\/$/, ""), process.env.BUSINESS_ROOT_DOMAIN || undefined);
}

function printCredentials(email: string, temporaryPassword: string): void {
  console.log(`  sign-in email:      ${email}`);
  console.log(`  temporary password: ${temporaryPassword}   (shown once; changed at first sign-in)`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!command || !url) {
    console.error("Usage: npm run tenants -- <list|create-organization|create-business|create-org-admin|assign-business> [--flag value]...");
    if (!url) console.error("DIRECT_URL or DATABASE_URL must point at the database owner.");
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    // The application role cannot create these rows. Say so up front.
    if ((await findRoleProblem(db)) === null) {
      throw new ProvisionError(
        "This connection is the restricted application role, which cannot create businesses. Use the database owner's URL (DIRECT_URL)."
      );
    }
    const values = flags(rest);

    switch (command) {
      case "list": {
        const { organizations, standalone } = await listTenants(db);
        for (const org of organizations) {
          console.log(`${org.name} (${org.slug})`);
          for (const b of org.businesses) console.log(`  - ${b.name} (${b.slug})  ${businessUrl(b.slug)}`);
        }
        if (standalone.length > 0) console.log("Standalone");
        for (const b of standalone) console.log(`  - ${b.name} (${b.slug})  ${businessUrl(b.slug)}`);
        break;
      }
      case "create-organization": {
        const organization = await createOrganization(db, { slug: required(values, "slug"), name: required(values, "name") });
        console.log(`Organization "${organization.name}" created (${organization.slug}).`);
        break;
      }
      case "create-business": {
        const input: NewBusiness = {
          slug: required(values, "slug"),
          name: required(values, "name"),
          organizationSlug: values.organization,
          timezone: values.timezone,
          currency: values.currency,
          defaultLocale: values.locale === "en" ? "en" : values.locale === "es" ? "es" : undefined,
        };
        if (values.locale && values.locale !== "en" && values.locale !== "es") throw new ProvisionError('--locale must be "en" or "es".');
        // Validate the administrator's email before anything is written.
        const adminEmail = values["admin-email"];
        const adminName = values["admin-name"];
        if ((adminEmail && !adminName) || (!adminEmail && adminName)) {
          throw new ProvisionError("--admin-email and --admin-name go together.");
        }

        const business = await createBusiness(db, input);
        console.log(`Business "${business.name}" created: ${businessUrl(business.slug)}`);
        console.log("  Card payments start off: it needs a Stripe account of its own before it can take them.");
        if (adminEmail && adminName) {
          const { user, temporaryPassword } = await createBusinessAdmin(db, { businessSlug: business.slug, email: adminEmail, name: adminName });
          printCredentials(user.email ?? adminEmail, temporaryPassword);
        }
        break;
      }
      case "create-org-admin": {
        const { user, temporaryPassword } = await createOrgAdmin(db, {
          organizationSlug: required(values, "organization"),
          email: required(values, "email"),
          name: required(values, "name"),
        });
        console.log(`Owner of "${values.organization}" created.`);
        printCredentials(user.email ?? values.email, temporaryPassword);
        break;
      }
      case "assign-business": {
        const business = await assignBusinessToOrganization(db, {
          businessSlug: required(values, "slug"),
          organizationSlug: required(values, "organization"),
        });
        console.log(`"${business.name}" now belongs to "${values.organization}".`);
        break;
      }
      default:
        throw new ProvisionError(`Unknown command "${command}".`);
    }
  } catch (err) {
    if (err instanceof ProvisionError) {
      console.error(err.message);
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
