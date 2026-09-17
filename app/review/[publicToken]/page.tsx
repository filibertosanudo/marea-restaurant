import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getOrderForReviewByPublicToken } from "@/lib/orders/queries";
import { toReviewableOrderDTO } from "@/lib/orders/dto";
import { getOrderLang } from "@/lib/i18n/cookie";
import { getReviewDictionary } from "@/lib/i18n/dictionaries";
import { ReviewForm } from "@/components/review/ReviewForm";

// A capacity token — see app/o/[publicToken]/page.tsx's own metadata comment.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const business = await getCurrentBusiness();
  const lang = await getOrderLang(business.defaultLocale === "en" ? "en" : "es");
  const dict = getReviewDictionary(lang);

  const raw = await getOrderForReviewByPublicToken(business.id, publicToken);
  if (!raw) notFound();

  const order = toReviewableOrderDTO(raw);

  let body: React.ReactNode;
  if (order.status === "CANCELLED") {
    body = <p className="text-[13.5px] leading-relaxed text-on-surface-muted">{dict.notReviewableCancelledBody}</p>;
  } else if (order.alreadyReviewed) {
    body = (
      <>
        <h2 className="mb-[8px] text-balance font-display text-[21px] font-semibold text-on-surface">
          {dict.alreadyReviewedTitle}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-on-surface-muted">{dict.alreadyReviewedBody}</p>
      </>
    );
  } else if (order.status !== "DELIVERED") {
    body = (
      <>
        <h2 className="mb-[8px] text-balance font-display text-[21px] font-semibold text-on-surface">
          {dict.notReviewableTitle}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-on-surface-muted">{dict.notReviewableBody}</p>
      </>
    );
  } else {
    body = <ReviewForm publicToken={publicToken} authorName={order.authorName} dict={dict} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-surface-subtle px-lg pb-lg pt-[40px] text-center">
      <div className="mb-[36px] flex items-center gap-[7px] opacity-70">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary font-display text-[10px] font-bold text-on-primary">
          M
        </span>
        <span className="font-display text-[12px] font-semibold tracking-wide text-on-surface">
          {dict.brand.toUpperCase()}
        </span>
      </div>

      {!order.alreadyReviewed && order.status === "DELIVERED" && (
        <>
          <h1 className="mb-[4px] text-balance font-display text-[24px] font-semibold text-on-surface">
            {dict.title.replace("{name}", order.authorName)}
          </h1>
          <p className="mb-lg text-[12px] text-on-surface-muted">{dict.orderLabel.replace("{orderNumber}", order.orderNumber)}</p>
        </>
      )}

      {body}
    </div>
  );
}
