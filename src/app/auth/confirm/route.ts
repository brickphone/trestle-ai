import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/auth/server";
export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (hash && (type === "signup" || type === "magiclink" || type === "email")) {
    const client = await authClient();
    const { error } = await client.auth.verifyOtp({ token_hash: hash, type });
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(
    new URL("/login?message=Link%20expired.%20Please%20request%20another.", request.url),
  );
}
