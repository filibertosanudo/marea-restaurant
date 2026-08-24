import type { Lang } from "@/lib/i18n/lang";
import { decimalToString } from "@/lib/dto/money";
import { pickTranslation } from "@/lib/i18n/translations";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  Cart,
  CartItem,
  CartItemModifier,
  MenuItem,
  MenuItemTranslation,
  ModifierOption,
  ModifierOptionTranslation,
  RestaurantTable,
} from "@/lib/generated/prisma/client";

export type CartLineDTO = {
  id: string;
  menuItemId: string;
  name: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  notes: string | null;
  modifiers: { id: string; name: string; priceDelta: string }[];
  isAvailable: boolean;
};

export type CartDTO = {
  id: string | null;
  orderType: "DINE_IN" | "TAKEAWAY" | "PICKUP" | "DELIVERY";
  tableId: string | null;
  tableLabel: string | null;
  availableItems: CartLineDTO[];
  unavailableItems: CartLineDTO[];
  itemCount: number;
  subtotal: string;
};

export const EMPTY_CART: CartDTO = {
  id: null,
  orderType: "TAKEAWAY",
  tableId: null,
  tableLabel: null,
  availableItems: [],
  unavailableItems: [],
  itemCount: 0,
  subtotal: "0.00",
};

type RawCartItem = CartItem & {
  menuItem: MenuItem & { translations: MenuItemTranslation[] };
  modifiers: (CartItemModifier & {
    option: ModifierOption & { translations: ModifierOptionTranslation[] };
  })[];
};

type RawCart = Cart & { table: RestaurantTable | null; items: RawCartItem[] };

function pickName<T extends { locale: string }>(translations: T[], lang: Lang, key: keyof T): string {
  const t = pickTranslation(translations, lang);
  return t ? String(t[key]) : "";
}

export function toCartDTO(cart: RawCart, lang: Lang): CartDTO {
  const lines: CartLineDTO[] = cart.items.map((item) => {
    const dishAvailable = item.menuItem.isAvailable && item.menuItem.deletedAt === null;
    const modifiers = item.modifiers.map((m) => ({
      id: m.option.id,
      name: pickName(m.option.translations, lang, "name"),
      priceDelta: decimalToString(m.option.priceDelta) ?? "0.00",
      available: m.option.isAvailable,
    }));
    const allModifiersAvailable = modifiers.every((m) => m.available);

    const unitPrice = modifiers
      .reduce((sum, m) => sum.add(m.priceDelta), item.menuItem.basePrice)
      .toDecimalPlaces(2);
    const lineTotal = unitPrice.mul(item.quantity).toDecimalPlaces(2);

    return {
      id: item.id,
      menuItemId: item.menuItemId,
      name: pickName(item.menuItem.translations, lang, "name"),
      unitPrice: unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: lineTotal.toFixed(2),
      notes: item.notes,
      modifiers: modifiers.map(({ id, name, priceDelta }) => ({ id, name, priceDelta })),
      isAvailable: dishAvailable && allModifiersAvailable,
    };
  });

  const availableItems = lines.filter((l) => l.isAvailable);
  const unavailableItems = lines.filter((l) => !l.isAvailable);

  const subtotal = availableItems
    .reduce((sum, l) => sum.add(l.lineTotal), new Prisma.Decimal(0))
    .toFixed(2);

  return {
    id: cart.id,
    orderType: cart.orderType,
    tableId: cart.tableId,
    tableLabel: cart.table ? cart.table.code : null,
    availableItems,
    unavailableItems,
    itemCount: availableItems.reduce((sum, l) => sum + l.quantity, 0),
    subtotal,
  };
}
