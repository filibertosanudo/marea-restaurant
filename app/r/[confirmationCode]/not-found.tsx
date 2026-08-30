import { getOrderLang } from "@/lib/i18n/cookie";
import { getReservationDictionary } from "@/lib/i18n/dictionaries";

export default async function ReservationNotFound() {
  const lang = await getOrderLang();
  const dict = getReservationDictionary(lang);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-subtle px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary font-display text-2xl font-bold text-on-primary">
        M
      </span>
      <div className="max-w-[42ch]">
        <h1 className="mb-2 font-display text-2xl font-semibold text-on-surface">
          {dict.reservationNotFoundTitle}
        </h1>
        <p className="text-[14.5px] leading-relaxed text-on-surface-muted">{dict.reservationNotFoundBody}</p>
      </div>
    </div>
  );
}
