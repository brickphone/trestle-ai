import { requireUser } from "@/lib/auth/server";
import { AccountMenu } from "@/components/product/account-menu";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { context } from "@/lib/data/repository";
import { selectOrganization } from "@/lib/data/actions";
import { signout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const [ctx, user] = await Promise.all([context(), requireUser()]);
  return (
    <AppShell
      isStaff={ctx.isStaff}
      demo={!!ctx.organization?.is_demo}
      organizationName={ctx.organization?.name}
      footer={
        <div className="flex flex-col gap-2">
          {ctx.isStaff && (
            <form action={selectOrganization} className="flex flex-col gap-2">
              <label htmlFor="staff-organization" className="text-xs text-fg-muted">
                Organization
              </label>
              <select
                id="staff-organization"
                name="organization_id"
                defaultValue={ctx.organization?.id}
                className="w-full rounded border border-border-input bg-surface p-1 text-sm"
              >
                {ctx.organizations.map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <Button type="submit">Switch organization</Button>
            </form>
          )}
          <AccountMenu email={user.email ?? "Account"} signOutAction={signout} placement="above" />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <p className="p-6" role="status">
          Loading workspace…
        </p>
      }
    >
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
