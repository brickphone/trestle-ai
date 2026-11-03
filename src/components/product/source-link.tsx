"use client";
import { useEffect, type ReactNode } from "react";

/** Reveal source disclosures when arriving from Overview or another route. */
export function SourceDisclosure() {
  useEffect(() => {
    const reveal = () => {
      const element = document.getElementById(window.location.hash.slice(1));
      if (element instanceof HTMLDetailsElement) {
        element.open = true;
        element.scrollIntoView({ block: "start" });
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return null;
}
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
