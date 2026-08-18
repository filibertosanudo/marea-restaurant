import { InputHTMLAttributes, forwardRef } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, id, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-[6px]">
        {label && (
          <label htmlFor={id} className="text-[13px] text-on-surface-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`rounded-md border border-border bg-surface px-md py-[12px] text-base text-on-surface outline-none transition-shadow focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)] ${className}`}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = "Input";
