import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createId } from "@paralleldrive/cuid2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { TenantPool } from "@/lib/db/tenant-pool";
import { runInTenant, runWithoutTenant, explicitTenant } from "@/lib/tenancy/context";
import { branchSqlError } from "@/lib/tenants/signup-errors";
import { testSchema } from "@/test/db";

// marea_add_branch() as the web process calls it: connected as marea_app,
// with the organization taken from the business the connection acts for. The
// owner arranges rows and checks what is really in the tables.

function urlAs(role: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${testSchema} -c role=${role}`);
  return url.toString();
}

const appPool = new TenantPool({ connectionString: urlAs("marea_app"), max: 4 }, () => explicitTenant());
const app = new PrismaClient({ adapter: new PrismaPg(appPool, { schema: testSchema }) });
const ownerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const owner = new PrismaClient({ adapter: new PrismaPg(ownerPool, { schema: testSchema }) });

afterAll(async () => {
  await app.$disconnect();
  await owner.$disconnect();
});

async function organization(verified = true) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const org = await owner.organization.create({ data: { name: `Org ${suffix}`, slug: `org-${suffix}`, verifiedAt: verified ? new Date() : null } });
  const main = await owner.business.create({ data: { name: "Main", slug: `main-${suffix}`, organizationId: org.id, currency: "USD", timezone: "America/Tijuana" } });
  return { org, main, suffix };
}

function addBranch(slug: string, max: number | null) {
  return app.$executeRaw`SELECT marea_add_branch(${createId()}, ${slug}, ${"Branch"}, ${createId()}, ${createId()}, ${max}::integer)`;
}

async function reason(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (err) {
    return branchSqlError(err) ?? String(err);
  }
}

describe("marea_add_branch, as marea_app", () => {
  it("adds the branch to the caller's own organization with its settings", async () => {
    const { org, main, suffix } = await organization();

    await runInTenant(main.id, () => addBranch(`sur-${suffix}`, null));

    const branch = await owner.business.findUniqueOrThrow({ where: { slug: `sur-${suffix}` } });
    expect(branch).toMatchObject({ organizationId: org.id, currency: "USD", timezone: "America/Tijuana", acceptsOnlinePayment: false });
    expect(await owner.businessTranslation.count({ where: { businessId: branch.id } })).toBe(2);
  });

  it("refuses past the allowance the caller passes", async () => {
    const { main, suffix } = await organization();
    expect(await reason(runInTenant(main.id, () => addBranch(`over-${suffix}`, 1)))).toBe("branch_limit");
  });

  it("lets only one of two simultaneous requests take the last branch", async () => {
    const { org, main, suffix } = await organization();

    const results = await Promise.all([
      reason(runInTenant(main.id, () => addBranch(`race-a-${suffix}`, 2))),
      reason(runInTenant(main.id, () => addBranch(`race-b-${suffix}`, 2))),
    ]);

    expect(results.sort()).toEqual(["branch_limit", "ok"]);
    expect(await owner.business.count({ where: { organizationId: org.id } })).toBe(2);
  });

  it("refuses with no business to act for, and for an unverified organization", async () => {
    const { suffix } = await organization();
    expect(await reason(runWithoutTenant(() => addBranch(`none-${suffix}`, null)))).toBe("no_business");

    const unverified = await organization(false);
    expect(await reason(runInTenant(unverified.main.id, () => addBranch(`unv-${unverified.suffix}`, null)))).toBe("unverified_organization");
  });

  it("checks the slug in the database too", async () => {
    const { main } = await organization();
    expect(await reason(runInTenant(main.id, () => addBranch("admin", null)))).toBe("reserved_slug");
    expect(await reason(runInTenant(main.id, () => addBranch("Not A Slug", null)))).toBe("invalid_slug");
  });
});
