"use client";
import type { ReactNode } from "react";
export function SourceLink({ target, children }: { target: string; children: ReactNode }) {
  return (
    <a
      href={`#${target}`}
      className="text-accent underline decoration-border-strong underline-offset-2"
      onClick={() => {
        const element = document.getElementById(target);
        if (element instanceof HTMLDetailsElement) element.open = true;
      }}
    >
      {children}
    </a>
  );
}
