import Link from "next/link";
import { Suspense } from "react";
import { login, magicLink, viewDemo } from "@/lib/auth/actions";
import { ActionForm } from "@/components/product/action-form";
import { Input } from "@/components/product/fields";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
async function Message({ params }: { params: Promise<{ message?: string }> }) {
  const { message } = await params;
  return message ? <p role="status">{message}</p> : null;
}
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  return (
    <>
      <h1 className="text-xl">Sign in</h1>
      <p>Cash-flow planning for federal construction contractors.</p>
      <Suspense>
        <Message params={searchParams} />
      </Suspense>
      <Panel title="Email and password">
        <ActionForm action={login} label="Sign in">
          <Input name="email" label="Email" type="email" required />
          <Input name="password" label="Password" type="password" required />
        </ActionForm>
      </Panel>
      <Panel title="Email a sign-in link">
        <ActionForm action={magicLink} label="Send sign-in link">
          <Input name="email" label="Account email" type="email" required />
        </ActionForm>
      </Panel>
      <Link href="/signup" className="text-accent underline">
        Create an account
      </Link>
      <form action={viewDemo}>
        <Button type="submit">View demo</Button>
        <p className="mt-2 text-sm text-fg-muted">
          Demo, fictional data. Opens a read-only demonstration account.
        </p>
      </form>
    </>
  );
}
