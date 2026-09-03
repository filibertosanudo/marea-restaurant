import { SelectHTMLAttributes, forwardRef } from "react";

type Option = { value: string; label: string };

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  options: Option[];
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, id, options, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-[6px]">
        {label && (
          <label htmlFor={id} className="text-[13px] text-on-surface-muted">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={`rounded-md border border-border bg-surface px-md py-[12px] text-base text-on-surface outline-none transition-shadow focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)] ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
);

Select.displayName = "Select";
