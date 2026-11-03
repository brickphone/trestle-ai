"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
export function AccountMenu({
  email,
  signOutAction,
  placement = "below",
}: {
  email: string;
  placement?: "above" | "below";
  signOutAction: (data: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    item = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      ref={root}
      data-account-menu
      data-placement={placement}
      className="relative text-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          close();
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (open) item.current?.focus();
          else setOpen(true);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`Account: ${email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={`flex h-9 items-center gap-2 rounded text-fg-muted hover:bg-surface-hover hover:text-fg ${placement === "above" ? "w-full justify-between px-3" : "max-w-48 px-2 sm:max-w-80"}`}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{email}</span>
        <Icon name="chevronDown" className="shrink-0" />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label="Account"
          className={`absolute z-20 min-w-40 rounded border border-border bg-surface p-1 ${placement === "above" ? "bottom-full left-0 mb-1" : "top-full right-0 mt-1"}`}
        >
          <form action={signOutAction} role="none">
            <button
              ref={item}
              type="submit"
              role="menuitem"
              className="flex h-9 w-full items-center rounded px-3 text-left hover:bg-surface-hover"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
