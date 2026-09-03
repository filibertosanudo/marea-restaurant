"use client";

import { useRef, useState, useTransition } from "react";
import { uploadMenuItemImageAction, type UploadImageState } from "@/lib/storage/actions";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function errorMessage(state: UploadImageState, dict: AdminDictionary): string | null {
  if (!state || !("error" in state)) return null;
  if (state.error === "too_large") return dict.menu.imageTooLarge;
  if (state.error === "unsupported_type") return dict.menu.imageInvalidType;
  return dict.menu.imageUploadError;
}

export function ImageField({
  dict,
  defaultValue,
}: {
  dict: AdminDictionary;
  defaultValue?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<UploadImageState>(undefined);
  const [currentUrl, setCurrentUrl] = useState<string>(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setState(undefined);

    if (file.size > MAX_BYTES) {
      setState({ error: "too_large" });
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setState({ error: "unsupported_type" });
      return;
    }

    // Local preview while the (reprocessed) upload is in flight — replaced
    // by the real, storage-backed URL once uploadMenuItemImageAction
    // resolves, same as any other optimistic-then-confirmed upload UI.
    setCurrentUrl(URL.createObjectURL(file));

    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadMenuItemImageAction(undefined, data);
      setState(result);
      if (result && "success" in result) setCurrentUrl(result.url);
    });
  }

  const error = errorMessage(state, dict);

  return (
    <div className="flex flex-col gap-[8px]">
      <label className="block text-[13px] font-medium text-on-surface">{dict.menu.image}</label>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div
        role="button"
        tabIndex={0}
        aria-busy={isPending}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-[8px] rounded-md border-[1.5px] border-dashed p-lg text-center ${
          isPending
            ? "cursor-wait border-border/50 bg-surface-subtle/60 text-on-surface-muted/60"
            : "border-border bg-surface-subtle text-on-surface-muted"
        }`}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- previews may point at an external URL the image loader can't optimize
          <img src={currentUrl} alt="" className="h-[96px] w-[96px] rounded-sm object-cover" />
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="8.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M21 15l-5.5-5-9.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        )}
        <span className="text-[13px]">
          {isPending ? dict.menu.imageUploading : currentUrl ? dict.menu.imageReplace : dict.menu.imageDropHint}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}

      <div>
        <label className="mb-[4px] block text-[12px] text-on-surface-muted">{dict.menu.imageUrlAlt}</label>
        <input
          name="imageUrl"
          type="url"
          value={currentUrl}
          onChange={(e) => setCurrentUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
        />
      </div>
    </div>
  );
}
