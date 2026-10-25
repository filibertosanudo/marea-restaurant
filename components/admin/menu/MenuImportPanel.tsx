"use client";

import { startTransition, useActionState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import {
  commitMenuImportAction,
  previewMenuImportAction,
  type ImportResultState,
  type PreviewState,
} from "@/lib/menu/import-actions";

type Dict = AdminDictionary["menuImport"];

function fileError(dict: Dict, error: string, missing?: string[]): string {
  switch (error) {
    case "no_file":
      return dict.errorNoFile;
    case "too_big":
      return dict.errorTooBig;
    case "too_many_rows":
      return dict.errorTooManyRows;
    case "missing_columns":
      return dict.errorMissingColumns.replace(
        "{columns}",
        (missing ?? []).map((column) => dict.columns[column as "category" | "name" | "price"] ?? column).join(", ")
      );
    default:
      return dict.errorEmpty;
  }
}

/**
 * One form, one file input, two buttons: the preview and the import read the
 * same selected file. Neither submits the form: React resets a form after its
 * action finishes, which emptied the file input after "Review file" and made
 * the owner choose the file again to import it (caught by
 * e2e/signup-to-first-order.spec.ts). Each button reads the form instead.
 */
export function MenuImportPanel({ dict }: { dict: Dict }) {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewMenuImportAction, undefined);
  const [result, importAction, importing] = useActionState<ImportResultState, FormData>(commitMenuImportAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  function run(action: (data: FormData) => void) {
    const form = formRef.current;
    if (!form?.reportValidity()) return;
    const data = new FormData(form);
    startTransition(() => action(data));
  }

  return (
    <details className="mx-lg mt-md rounded-md border border-border bg-surface p-md">
      <summary className="cursor-pointer text-[13px] font-medium text-on-surface">{dict.title}</summary>
      <p className="mt-sm text-[12px] text-on-surface-muted">{dict.lead}</p>

      <form ref={formRef} onSubmit={(event) => event.preventDefault()} className="mt-md flex flex-col gap-md">
        <input type="file" name="file" accept=".csv,text/csv" required className="text-[13px]" />
        <label className="flex items-center gap-[6px] text-[12.5px] text-on-surface">
          <input type="checkbox" name="updateExisting" />
          {dict.updateExisting}
        </label>
        <div className="flex gap-sm">
          <Button type="button" variant="secondary" onClick={() => run(previewAction)} disabled={previewing}>
            {dict.review}
          </Button>
          <Button type="button" onClick={() => run(importAction)} disabled={importing}>
            {dict.run}
          </Button>
        </div>
      </form>

      {preview && !preview.ok && (
        <p role="alert" className="mt-md text-[12.5px] text-error">
          {fileError(dict, preview.error, preview.missing)}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="mt-md text-[12.5px] text-error">
          {fileError(dict, result.error)}
        </p>
      )}
      {result?.ok && (
        <p role="status" className="mt-md text-[13px] text-success">
          {dict.done
            .replace("{created}", String(result.created))
            .replace("{updated}", String(result.updated))
            .replace("{skipped}", String(result.skippedExisting + result.skippedDuplicates))
            .replace("{errors}", String(result.errors))}
        </p>
      )}

      {preview?.ok && (
        <div className="mt-md">
          <p className="mb-sm text-[12.5px] text-on-surface">
            {dict.summary
              .replace("{new}", String(preview.counts.new))
              .replace("{existing}", String(preview.counts.existing))
              .replace("{duplicates}", String(preview.counts.duplicates))
              .replace("{errors}", String(preview.counts.errors))}
          </p>
          <div className="max-h-[320px] overflow-auto rounded-sm border border-border">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-sm py-[6px]">{dict.columns.line}</th>
                  <th className="px-sm py-[6px]">{dict.columns.category}</th>
                  <th className="px-sm py-[6px]">{dict.columns.name}</th>
                  <th className="px-sm py-[6px]">{dict.columns.price}</th>
                  <th className="px-sm py-[6px]">{dict.columns.status}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className="border-t border-border">
                    <td className="px-sm py-[6px] tabular-nums">{row.line}</td>
                    <td className="px-sm py-[6px]">{row.category}</td>
                    <td className="px-sm py-[6px]">{row.name}</td>
                    <td className="px-sm py-[6px] tabular-nums">{row.price ? `${row.rawPrice} → ${row.price}` : row.rawPrice}</td>
                    <td className={`px-sm py-[6px] ${row.status === "error" ? "text-error" : ""}`}>
                      {row.problem ? dict.problems[row.problem] : dict.statuses[row.status]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </details>
  );
}
