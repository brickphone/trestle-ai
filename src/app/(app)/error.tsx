"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

function describe(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string") return `Reference: ${digest}`;
  }
  return undefined;
}

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-6">
      <ErrorState
        title="This page failed to load"
        description="Please retry or contact support with the reference below."
        detail={describe(error)}
        action={<Button onClick={retry}>Retry</Button>}
      />
    </div>
  );
}
