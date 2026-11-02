import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/auth/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const client = await authClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(
    new URL("/login?message=Link%20expired.%20Please%20request%20another.", request.url),
  );
}
