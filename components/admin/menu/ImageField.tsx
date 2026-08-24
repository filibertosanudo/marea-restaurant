import { isStorageConfigured } from "@/lib/storage/config";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

/**
 * Supabase Storage isn't configured in this environment (see
 * lib/storage/config.ts) — this renders the dropzone shell the design
 * documents, but disabled with an explanatory hint, and always shows the
 * URL field as the real working path. When storage is configured, the
 * dropzone half should be wired to an actual upload handler and this
 * comment removed.
 */
export function ImageField({
  dict,
  defaultValue,
}: {
  dict: AdminDictionary;
  defaultValue?: string | null;
}) {
  const configured = isStorageConfigured();

  return (
    <div className="flex flex-col gap-[8px]">
      <label className="block text-[13px] font-medium text-on-surface">
        {dict.menu.image}
      </label>

      <div
        aria-disabled={!configured}
        className={`flex flex-col items-center gap-[8px] rounded-md border-[1.5px] border-dashed p-lg text-center ${
          configured
            ? "border-border bg-surface-subtle text-on-surface-muted"
            : "cursor-not-allowed border-border/50 bg-surface-subtle/60 text-on-surface-muted/60"
        }`}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="8.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M21 15l-5.5-5-9.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <span className="text-[13px]">
          {configured ? dict.menu.imageDropHint : dict.menu.imageStorageUnconfigured}
        </span>
      </div>

      <div>
        <label className="mb-[4px] block text-[12px] text-on-surface-muted">
          {dict.menu.imageUrlAlt}
        </label>
        <input
          name="imageUrl"
          type="url"
          defaultValue={defaultValue ?? ""}
          placeholder="https://…"
          className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
        />
      </div>
    </div>
  );
}
