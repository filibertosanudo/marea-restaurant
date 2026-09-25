import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getBusinessForRequest } from "@/lib/business";
import { listAccessibleBusinesses } from "@/lib/auth/business-access";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  listMenuItemsRaw,
  listCategoriesRaw,
  listTagsRaw,
  listModifierGroupsRaw,
} from "@/lib/menu/queries";
import {
  toMenuItemListDTO,
  toCategoryListDTO,
  toTagDTO,
  toModifierGroupDTO,
} from "@/lib/dto/menu";
import { MenuSectionTabs } from "@/components/admin/menu/MenuSectionTabs";
import { ItemTable } from "@/components/admin/menu/ItemTable";
import { CopyMenuPanel } from "@/components/admin/menu/CopyMenuPanel";
import type { Lang } from "@/lib/i18n/lang";

const PAGE_SIZE = 8;

type SearchParams = {
  q?: string;
  category?: string;
  availability?: string;
  page?: string;
};

export default async function MenuItemsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePageRole(
    "/admin/login",
    UserRole.STAFF,
    UserRole.BUSINESS_ADMIN,
    UserRole.SUPER_ADMIN
  );
  const canManage = session.user.role !== UserRole.STAFF;

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const availability =
    params.availability === "available" || params.availability === "unavailable"
      ? params.availability
      : undefined;

  const [business, lang] = await Promise.all([getBusinessForRequest(), getAdminLang()]);
  const dict = getDictionary(lang);

  const [{ items, total }, categories, tags, modifierGroups] = await Promise.all([
    listMenuItemsRaw(business.id, {
      search: params.q,
      categoryId: params.category,
      availability,
      page,
      pageSize: PAGE_SIZE,
    }),
    listCategoriesRaw(business.id),
    listTagsRaw(business.id),
    listModifierGroupsRaw(business.id),
  ]);

  // A branch with no menu, run by someone who runs another one too, can copy
  // that one's menu instead of typing it again (lib/menu/copy.ts).
  const menuIsEmpty = canManage && categories.length === 0 && total === 0;
  const copySources = menuIsEmpty
    ? (await listAccessibleBusinesses(session.user.id)).filter((b) => b.id !== business.id)
    : [];

  return (
    <div className="flex h-full flex-col">
      <MenuSectionTabs active="items" dict={dict} />
      {copySources.length > 0 && <CopyMenuPanel dict={dict.menu} sources={copySources.map((b) => ({ id: b.id, name: b.name }))} />}
      <ItemTable
        items={items.map((i) => toMenuItemListDTO(i, lang))}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        categories={categories.map((c) => toCategoryListDTO(c, lang))}
        tags={tags.map((t) => toTagDTO(t, lang))}
        modifierGroups={modifierGroups.map((g) => toModifierGroupDTO(g, lang))}
        dict={dict}
        defaultLocale={business.defaultLocale as Lang}
        canManage={canManage}
        filters={{ q: params.q ?? "", category: params.category ?? "", availability: availability ?? "" }}
      />
    </div>
  );
}
