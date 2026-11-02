import Link from "next/link";
import { signup } from "@/lib/auth/actions";
import { ActionForm } from "@/components/product/action-form";
import { Input } from "@/components/product/fields";
export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl">Create an account</h1>
      <p>Start with your company UEI or enter your jobs manually.</p>
      <ActionForm action={signup} label="Create account">
        <Input name="email" label="Email" type="email" required />
        <Input
          name="password"
          label="Password"
          type="password"
          required
          hint="Use at least 12 characters."
        />
      </ActionForm>
      <Link href="/login" className="text-accent underline">
        Already have an account? Sign in
      </Link>
    </>
  );
}
