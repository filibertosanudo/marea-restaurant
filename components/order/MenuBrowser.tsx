"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import type { PublicCategory, PublicDish } from "@/lib/menu/public-menu";
import type { CartDTO } from "@/lib/cart/dto";
import type { OrderDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { addToCartAction } from "@/lib/cart/actions";
import { DishCard } from "./DishCard";
import { ItemSheet } from "./ItemSheet";
import { CartSheet } from "./CartSheet";
import { StickyCartBar } from "./StickyCartBar";
import { OrderControls } from "./OrderControls";

export function MenuBrowser({
  categories,
  dishes,
  cart,
  dict,
  lang,
  currency,
  tableLabel,
}: {
  categories: PublicCategory[];
  dishes: PublicDish[];
  cart: CartDTO;
  dict: OrderDictionary;
  lang: Lang;
  currency: string;
  tableLabel: string | null;
}) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? "");
  const [openDish, setOpenDish] = useState<PublicDish | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const visibleDishes = useMemo(
    () => dishes.filter((d) => d.category === activeCategory),
    [dishes, activeCategory]
  );

  const boundAddAction = addToCartAction.bind(null, lang);

  return (
    <div className="flex min-h-screen flex-col bg-surface-subtle">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-sm border-b border-border/20 bg-surface px-md py-sm">
        <div className="flex items-center gap-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary font-display text-[12px] font-bold text-on-primary">
            M
          </span>
          <span className="font-display text-[15px] font-semibold text-on-surface">
            {dict.brand}
          </span>
          {tableLabel && (
            <span className="rounded-full border border-surface-ocean-border/40 bg-surface-ocean px-sm py-[3px] text-[11px] font-medium text-primary">
              {dict.table.replace("{code}", tableLabel)}
            </span>
          )}
          {!tableLabel && (
            <span className="rounded-full border border-border/30 bg-surface-subtle px-sm py-[3px] text-[11px] font-medium text-on-surface-muted">
              {dict.takeaway}
            </span>
          )}
        </div>
        <OrderControls lang={lang} />
      </header>

      <div className="sticky top-[53px] z-10 flex gap-[8px] overflow-x-auto border-b border-border/15 bg-surface px-md py-sm">
        <Tabs
          items={categories.map((c) => ({ id: c.id, label: c.label }))}
          value={activeCategory}
          onChange={setActiveCategory}
        />
      </div>

      <main className="flex flex-1 flex-col gap-md px-md py-lg pb-[100px]">
        {visibleDishes.map((dish) => (
          <DishCard
            key={dish.id}
            dish={dish}
            currency={currency}
            locale={lang}
            addLabel={dict.add}
            onOpen={setOpenDish}
          />
        ))}
      </main>

      <StickyCartBar
        itemCount={cart.itemCount}
        hasLines={cart.availableItems.length + cart.unavailableItems.length > 0}
        subtotal={cart.subtotal}
        currency={currency}
        locale={lang}
        label={dict.itemsWord}
        cta={dict.viewCart}
        unavailableNotice={dict.unavailableInCartToast}
        onOpen={() => setCartOpen(true)}
      />

      {openDish && (
        <ItemSheet
          dish={openDish}
          currency={currency}
          locale={lang}
          dict={dict}
          boundAddAction={boundAddAction}
          onClose={() => setOpenDish(null)}
          onAdded={() => setOpenDish(null)}
        />
      )}

      {cartOpen && (
        <CartSheet
          cart={cart}
          currency={currency}
          locale={lang}
          dict={dict}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}
