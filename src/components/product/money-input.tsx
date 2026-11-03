"use client";
import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { TextInput } from "@/components/ui/form";
import { formatMoneyInput, moneyInputCaret, ungroupMoneyInput } from "@/lib/money-input";
export function MoneyInput({
  value,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof TextInput>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const input = inputRef.current,
      position = pendingCaret.current;
    pendingCaret.current = null;
    if (input && document.activeElement === input && position !== null)
      input.setSelectionRange(position, position);
  });
  return (
    <TextInput
      {...props}
      ref={inputRef}
      inputMode="decimal"
      value={formatMoneyInput(value)}
      onChange={(event) => {
        const input = event.currentTarget,
          text = input.value;
        const raw = ungroupMoneyInput(text),
          formatted = formatMoneyInput(raw);
        const position = moneyInputCaret(text, input.selectionStart ?? text.length, formatted);
        pendingCaret.current = position;
        onValueChange(raw);
      }}
    />
  );
}
