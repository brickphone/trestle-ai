import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

const control =
  "h-8 w-full rounded border border-border-input bg-surface px-2 text-base text-fg placeholder:text-fg-subtle disabled:bg-surface-muted disabled:text-fg-subtle aria-invalid:border-danger";

/** Label above a control. Always render a visible label; placeholders are not labels. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-fg-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

/** Numeric input with an optional unit adornment ("$", "%", "days"). Keeps tabular figures. */
export function NumberInput({
  className,
  prefix,
  suffix,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "prefix"> & {
  prefix?: string;
  suffix?: string;
}) {
  if (!prefix && !suffix) {
    return (
      <input
        type="number"
        inputMode="decimal"
        className={cn(control, "text-right", className)}
        {...rest}
      />
    );
  }
  return (
    <div className={cn("relative flex items-center", className)}>
      {prefix ? (
        <span aria-hidden className="pointer-events-none absolute left-2 text-sm text-fg-subtle">
          {prefix}
        </span>
      ) : null}
      <input
        type="number"
        inputMode="decimal"
        className={cn(control, "text-right", prefix && "pl-6", suffix && "pr-12")}
        {...rest}
      />
      {suffix ? (
        <span aria-hidden className="pointer-events-none absolute right-2 text-sm text-fg-subtle">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(control, "appearance-none pr-7")} {...rest}>
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={14}
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "h-auto min-h-20 py-1.5", className)} {...rest} />;
}

export function Checkbox({
  label,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-base text-fg", className)}>
      <input type="checkbox" className="size-4 rounded-sm accent-accent" {...rest} />
      {label}
    </label>
  );
}
