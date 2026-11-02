import { PRODUCT_NAME } from "@/lib/config";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 p-6">
      <p className="text-lg font-semibold">{PRODUCT_NAME}</p>
      {children}
    </main>
  );
}
