import { ReactNode } from "react";

type Column<T> = {
  key: keyof T;
  header: string;
  render?: (row: T) => ReactNode;
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
};

export function Table<T>({ columns, rows, rowKey }: TableProps<T>) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className="px-md py-[10px] text-[12px] font-medium uppercase tracking-[0.04em] text-on-surface-muted"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border last:border-none hover:bg-surface-subtle"
            >
              {columns.map((col) => (
                <td key={String(col.key)} className="px-md py-[10px] text-on-surface">
                  {col.render ? col.render(row) : String(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
