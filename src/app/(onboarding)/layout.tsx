import { Suspense } from "react";
import { requireUser } from "@/lib/auth/server";
import { signout } from "@/lib/auth/actions";
import { PRODUCT_NAME } from "@/lib/config";
import { AccountMenu } from "@/components/product/account-menu";
async function FocusedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="flex h-[73px] items-center justify-between gap-4 border-b border-border px-6 sm:px-10">
        <span className="text-lg font-medium tracking-tight">{PRODUCT_NAME}</span>
        <AccountMenu email={user.email ?? "Account"} signOutAction={signout} />
      </header>
      {children}
    </>
  );
}
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          Loading setup…
        </p>
      }
    >
      <FocusedLayout>{children}</FocusedLayout>
    </Suspense>
  );
}
