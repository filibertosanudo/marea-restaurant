import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentBusiness } from "@/lib/business";
import { getCartWithLivePrices } from "@/lib/cart/queries";
import { getOrderLang } from "@/lib/i18n/cookie";
import { getOrderDictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/dto/money";
import { Prisma } from "@/lib/generated/prisma/client";
import { CheckoutForm } from "@/components/order/CheckoutForm";

export default async function CheckoutPage() {
  const business = await getCurrentBusiness();
  const lang = await getOrderLang(business.defaultLocale === "en" ? "en" : "es");
  const dict = getOrderDictionary(lang);
  const cart = await getCartWithLivePrices(business.id, lang);

  if (cart.availableItems.length === 0) {
    redirect("/menu");
  }

  const subtotal = new Prisma.Decimal(cart.subtotal);
  const taxTotal = subtotal.mul(business.taxRate).toDecimalPlaces(2);
  const total = subtotal.add(taxTotal).toDecimalPlaces(2);

  return (
    <div className="mx-auto flex min-h-screen max-w-[520px] flex-col gap-lg px-md py-lg">
      <div className="flex items-center gap-sm">
        <Link
          href="/menu"
          aria-label={dict.backToMenu}
          className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-subtle"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-semibold text-on-surface">
          {dict.checkoutTitle}
        </h1>
      </div>

      <div className="rounded-lg bg-surface p-lg shadow-1">
        <ul className="flex flex-col gap-sm">
          {cart.availableItems.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-md text-[13.5px]">
              <div>
                <span className="font-medium text-on-surface">
                  {line.quantity}× {line.name}
                </span>
                {line.modifiers.length > 0 && (
                  <p className="mt-[2px] text-[11.5px] text-on-surface-muted">
                    {line.modifiers.map((m) => m.name).join(" · ")}
                  </p>
                )}
              </div>
              <span className="shrink-0 tabular-nums text-on-surface">
                {formatMoney(line.lineTotal, business.currency, lang)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-md flex flex-col gap-[6px] border-t border-border/20 pt-md text-[13px]">
          <div className="flex justify-between text-on-surface-muted">
            <span>{dict.subtotal}</span>
            <span className="tabular-nums">{formatMoney(cart.subtotal, business.currency, lang)}</span>
          </div>
          <div className="flex justify-between text-on-surface-muted">
            <span>{dict.tax}</span>
            <span className="tabular-nums">{formatMoney(taxTotal.toFixed(2), business.currency, lang)}</span>
          </div>
          <div className="flex justify-between font-display text-[17px] font-semibold text-on-surface">
            <span>{dict.total}</span>
            <span className="tabular-nums">{formatMoney(total.toFixed(2), business.currency, lang)}</span>
          </div>
        </div>
      </div>

      <CheckoutForm dict={dict} lang={lang} />
    </div>
  );
}
