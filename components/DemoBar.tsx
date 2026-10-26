import { env } from "@/lib/env";
import { isDemo } from "@/lib/demo/mode";
import { getOrderLang } from "@/lib/i18n/cookie";
import { getOrderDictionary } from "@/lib/i18n/dictionaries";

/**
 * A slim bar across the top of every page of the public demo (DEMO_MODE):
 * that it is a demo, that orders are paid at the counter (each branch would
 * need its own connected Stripe account to take cards, see
 * lib/payments/availability.ts), and a link to the code. Renders nothing
 * anywhere else.
 */
export async function DemoBar() {
  if (!isDemo()) return null;
  const dict = getOrderDictionary(await getOrderLang());
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-md gap-y-[2px] bg-primary px-md py-[6px] text-center text-[12px] text-on-primary">
      <span>{dict.demoBanner}</span>
      {env.DEMO_SOURCE_URL && (
        <a href={env.DEMO_SOURCE_URL} className="font-medium underline underline-offset-2" target="_blank" rel="noreferrer">
          {dict.demoSource}
        </a>
      )}
    </div>
  );
}
