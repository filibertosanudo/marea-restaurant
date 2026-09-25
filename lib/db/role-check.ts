import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Row level security does nothing for a table's owner or for a superuser: a
 * deployment that connects the application as the role that ran the
 * migrations has policies that look right and protect nothing. This is the
 * check that says so, at boot, instead of leaving it to be noticed after a
 * leak. It answers with what is wrong, or null.
 */
export async function findRoleProblem(client: Pick<PrismaClient, "$queryRaw">): Promise<string | null> {
  const [row] = await client.$queryRaw<
    Array<{ role: string; rolsuper: boolean; rolbypassrls: boolean; ownstables: boolean }>
  >`
    SELECT current_user::text AS role, r.rolsuper, r.rolbypassrls,
           EXISTS (
             SELECT 1 FROM pg_tables WHERE schemaname = current_schema() AND tableowner = current_user
           ) AS ownstables
    FROM pg_roles r WHERE r.rolname = current_user
  `;
  if (!row) return "could not read the role this connection runs as";
  if (row.rolsuper) return `connects as "${row.role}", a superuser`;
  if (row.rolbypassrls) return `connects as "${row.role}", which has BYPASSRLS`;
  if (row.ownstables) return `connects as "${row.role}", which owns the tables`;
  return null;
}
