"use client";
import { Icon } from "@/components/ui/icon";
import { useId, useRef, useState, type ReactNode } from "react";
export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId(),
    button = useRef<HTMLButtonElement>(null),
    [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const show = () => {
    const rect = button.current?.getBoundingClientRect();
    if (rect)
      setPosition({
        top: rect.bottom,
        left: Math.max(12, Math.min(rect.right - 256, window.innerWidth - 268)),
      });
  };
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setPosition(null)}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-describedby={position ? id : undefined}
        onClick={show}
        onFocus={show}
        onBlur={() => setPosition(null)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setPosition(null);
        }}
        className="inline-flex size-6 items-center justify-center rounded text-xs text-fg-muted hover:bg-surface-muted"
      >
        <Icon name="info" />
      </button>
      {position && (
        <span
          id={id}
          role="tooltip"
          style={position}
          className="shadow-sm fixed z-30 w-64 rounded border border-border bg-surface p-3 text-xs font-normal text-fg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
