// Minimal row builders for integration tests. Each factory inserts exactly
// one row of its own kind — required foreign keys are explicit parameters,
// never auto-created, so a test's setup reads as the exact shape it needs
// instead of a hidden cascade. No branching on the inputs: a factory with
// an `if` is a test hiding in the wrong place.
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import type { Prisma, UserRole } from "@/lib/generated/prisma/client";

export function makeBusiness(overrides: Partial<Prisma.BusinessUncheckedCreateInput> = {}) {
  return prisma.business.create({
    data: {
      slug: `business-${createId()}`,
      name: "Test Business",
      ...overrides,
    },
  });
}

export function makeMenuCategory(
  businessId: string,
  overrides: Partial<Prisma.MenuCategoryUncheckedCreateInput> = {}
) {
  return prisma.menuCategory.create({
    data: {
      businessId,
      slug: `category-${createId()}`,
      ...overrides,
    },
  });
}

export function makeMenuItem(
  businessId: string,
  categoryId: string,
  overrides: Partial<Prisma.MenuItemUncheckedCreateInput> = {}
) {
  return prisma.menuItem.create({
    data: {
      businessId,
      categoryId,
      slug: `item-${createId()}`,
      basePrice: "10.00",
      ...overrides,
    },
  });
}

export function makeModifierGroup(
  businessId: string,
  overrides: Partial<Prisma.ModifierGroupUncheckedCreateInput> = {}
) {
  return prisma.modifierGroup.create({
    data: {
      businessId,
      slug: `modifier-group-${createId()}`,
      ...overrides,
    },
  });
}

export function makeCart(businessId: string, overrides: Partial<Prisma.CartUncheckedCreateInput> = {}) {
  return prisma.cart.create({
    data: {
      businessId,
      sessionToken: `session-${createId()}`,
      ...overrides,
    },
  });
}

export function makeOrder(businessId: string, overrides: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
  return prisma.order.create({
    data: {
      businessId,
      orderNumber: `TEST-${createId()}`,
      ...overrides,
    },
  });
}

export function makeStaff(role: UserRole, overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  return prisma.user.create({
    data: {
      email: `staff-${createId()}@test.marea`,
      role,
      ...overrides,
    },
  });
}
