import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listTestimonialsByStatusRaw } from "@/lib/testimonials/queries";
import { toTestimonialModerationDTO } from "@/lib/dto/testimonials";
import { TestimonialModerationScreen } from "@/components/admin/testimonials/TestimonialModerationScreen";

export default async function TestimonialsPage() {
  await requirePageRole("/admin/login", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang);

  const [pending, approved, rejected] = await Promise.all([
    listTestimonialsByStatusRaw(business.id, "PENDING"),
    listTestimonialsByStatusRaw(business.id, "APPROVED"),
    listTestimonialsByStatusRaw(business.id, "REJECTED"),
  ]);

  return (
    <TestimonialModerationScreen
      pending={pending.map(toTestimonialModerationDTO)}
      approved={approved.map(toTestimonialModerationDTO)}
      rejected={rejected.map(toTestimonialModerationDTO)}
      dict={dict}
      lang={lang}
    />
  );
}
