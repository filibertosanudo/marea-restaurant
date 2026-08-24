export default function ModifiersLoading() {
  return (
    <div className="flex flex-col gap-[10px] p-lg" aria-busy="true" aria-live="polite">
      <div className="h-[28px] w-[220px] animate-pulse rounded-sm bg-surface-subtle" />
      <div className="mt-[10px] h-[300px] w-full animate-pulse rounded-md bg-surface-subtle" />
    </div>
  );
}
