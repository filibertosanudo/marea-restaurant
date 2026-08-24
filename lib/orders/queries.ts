import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * publicToken is the entire auth model for this page — an unauthenticated
 * guest reaches their order by knowing this token and nothing else (see
 * schema.prisma: cuid(2), not the guessable cuid() default). Never resolve
 * an order by id or orderNumber for a public-facing read.
 */
export async function getOrderByPublicToken(businessId: string, publicToken: string) {
  return prisma.order.findFirst({
    where: { businessId, publicToken },
    include: {
      table: true,
      items: { include: { modifiers: true }, orderBy: { createdAt: "asc" } },
    },
  });
}
