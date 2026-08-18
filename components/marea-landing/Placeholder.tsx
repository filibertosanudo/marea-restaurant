export function Placeholder({ label, navy = false }: { label: string; navy?: boolean }) {
  return (
    <div className={`ml-placeholder${navy ? " navy" : ""}`}>
      <span>{label}</span>
    </div>
  );
}
