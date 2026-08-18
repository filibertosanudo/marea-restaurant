export function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="w-[130px] rounded-md bg-surface p-md text-center shadow-1">
      <div className="font-display text-[28px] font-semibold text-primary">
        {value}
      </div>
      <div className="mt-[4px] text-[12px] text-on-surface-muted">{label}</div>
    </div>
  );
}
