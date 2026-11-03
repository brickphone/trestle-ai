import { PRODUCT_NAME } from "@/lib/config";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-6 py-12">
      <p className="mb-4 text-lg font-medium tracking-tight">{PRODUCT_NAME}</p>
      {children}
    </main>
  );
}
