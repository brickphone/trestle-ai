"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../button";
import { Icon } from "../icon";

export type PickerColumn = {
  id: string;
  label: string;
  visible: boolean;
  canHide: boolean;
};

/**
 * Disclosure menu of column checkboxes. Escape or a click outside closes it
 * and returns focus to the trigger.
 */
export function ColumnPicker({
  columns,
  onToggle,
  onReset,
}: {
  columns: PickerColumn[];
  onToggle: (id: string, visible: boolean) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        size="sm"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="columns" size={14} />
        Columns
        <span className="text-fg-subtle tabular">
          {visibleCount}/{columns.length}
        </span>
      </Button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="group"
          aria-label="Visible columns"
          className="absolute top-full right-0 z-20 mt-1 flex max-h-96 w-64 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-menu"
        >
          <ul className="flex flex-col overflow-y-auto py-1">
            {columns.map((c) => (
              <li key={c.id}>
                <label className="flex h-8 items-center gap-2 px-3 text-base text-fg hover:bg-surface-hover has-disabled:text-fg-subtle">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={c.visible}
                    disabled={!c.canHide}
                    onChange={(e) => onToggle(c.id, e.target.checked)}
                  />
                  <span className="truncate">{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-border px-2 py-2">
            <Button size="sm" variant="ghost" onClick={onReset}>
              Reset to default
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
