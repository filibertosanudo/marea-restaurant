type TabItem = { id: string; label: string };

type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
};

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className="inline-flex w-fit gap-[4px] rounded-full bg-surface-subtle p-[4px]">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-full px-md py-[8px] text-[14px] font-medium transition-colors ${
              active
                ? "bg-primary text-on-primary"
                : "text-on-surface-muted hover:bg-surface-ocean hover:text-on-surface"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
