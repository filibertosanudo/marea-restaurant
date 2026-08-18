export function SectionHead({
  eyebrow,
  title,
  lead,
  center = false,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  center?: boolean;
}) {
  return (
    <div className={`ml-sec-head${center ? " center" : ""}`}>
      <div className="ml-eyebrow">{eyebrow}</div>
      <h2 className="ml-disp">{title}</h2>
      {lead && <p className="ml-lead">{lead}</p>}
    </div>
  );
}
