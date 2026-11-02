import { Field, TextInput, Select, Textarea } from "@/components/ui/form";
import type { ReactNode } from "react";
export function Input({
  name,
  label,
  type = "text",
  value = "",
  required = false,
  hint,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number | null;
  required?: boolean;
  hint?: string;
  min?: string | number;
  max?: string | number;
  step?: string;
}) {
  const controlId = `${name}-${label.replace(/[^a-zA-Z0-9]/g, "-")}`;
  return (
    <Field htmlFor={controlId} label={label} hint={hint}>
      <TextInput
        id={controlId}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        min={min}
        max={max}
        step={step}
        aria-describedby={hint ? `${controlId}-hint` : undefined}
      />
    </Field>
  );
}
export function Options({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value?: string;
  children: ReactNode;
}) {
  const controlId = `${name}-${label.replace(/[^a-zA-Z0-9]/g, "-")}`;
  return (
    <Field htmlFor={controlId} label={label}>
      <Select id={controlId} name={name} defaultValue={value}>
        {children}
      </Select>
    </Field>
  );
}
export function Notes({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: string | null;
}) {
  const controlId = `${name}-${label.replace(/[^a-zA-Z0-9]/g, "-")}`;
  return (
    <Field htmlFor={controlId} label={label}>
      <Textarea id={controlId} name={name} defaultValue={value ?? ""} />
    </Field>
  );
}
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
export const dollars = (value: number | null | undefined) =>
  value == null ? "" : (value / 100).toFixed(2);
