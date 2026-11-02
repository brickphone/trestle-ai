"use client";
import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
export type ActionResult = { error?: string; success?: string };
export type FormAction = (state: ActionResult, data: FormData) => Promise<ActionResult>;
export function ActionForm({
  action,
  children,
  label = "Save",
  readOnly = false,
  id,
}: {
  action: FormAction;
  children?: ReactNode;
  label?: string;
  readOnly?: boolean;
  id?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} id={id} className="flex flex-col gap-3">
      {state.error && (
        <p
          role="alert"
          className="rounded border border-danger bg-danger-subtle p-3 text-danger-strong"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-success-strong">
          {state.success}
        </p>
      )}
      <fieldset disabled={pending || readOnly} className="flex min-w-0 flex-col gap-3">
        {children}
        <div>
          <Button type="submit" variant="primary">
            {pending ? "Saving…" : label}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
