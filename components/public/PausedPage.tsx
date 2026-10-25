import { getOrderLang } from "@/lib/i18n/cookie";
import { getOrderDictionary } from "@/lib/i18n/dictionaries";

/**
 * What a guest sees at a suspended restaurant (module 19, phase 8): a page
 * that names the restaurant and says it is not taking orders, never an error.
 * Links already sent (an order to track, a booking to cancel) keep working;
 * only the site, the menu and the table QR codes land here.
 */
export async function PausedPage({ name, phone }: { name: string; phone: string | null }) {
  const dict = getOrderDictionary(await getOrderLang());
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-subtle px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary font-display text-2xl font-bold text-on-primary">
        {name.trim().charAt(0).toUpperCase() || "M"}
      </span>
      <div className="max-w-[42ch]">
        <h1 className="mb-2 font-display text-2xl font-semibold text-on-surface">{dict.pausedTitle.replace("{name}", name)}</h1>
        <p className="text-[14.5px] leading-relaxed text-on-surface-muted">{dict.pausedBody}</p>
        {phone && <p className="mt-3 text-[14.5px] text-on-surface">{dict.pausedPhone.replace("{phone}", phone)}</p>}
      </div>
    </div>
  );
}
