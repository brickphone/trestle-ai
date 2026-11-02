import { notFound } from "next/navigation";
import { context } from "@/lib/data/repository";
export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  if (!(await context()).isStaff) notFound();
  return children;
}
