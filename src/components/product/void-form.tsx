import { voidRecord } from "@/lib/data/actions";
import { ActionForm } from "./action-form";
import { Input, Hidden } from "./fields";
export function VoidForm({
  kind,
  id,
  readOnly = false,
}: {
  kind: string;
  id: string;
  readOnly?: boolean;
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-fg-muted">Void record</summary>
      <div className="pt-3">
        <ActionForm action={voidRecord} label="Void record" readOnly={readOnly}>
          <Hidden name="kind" value={kind} />
          <Hidden name="id" value={id} />
          <Input
            name="reason"
            label={`Void reason (${id.slice(0, 8)})`}
            required
            hint="The record stays in history and is excluded from totals."
          />
        </ActionForm>
      </div>
    </details>
  );
}
