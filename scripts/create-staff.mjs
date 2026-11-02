import { adminDb } from "./lib/admin.mjs";
const userId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(userId ?? ""))
  throw new Error("Usage: npm run staff:create -- <existing-auth-user-uuid>");
const client = adminDb();
try {
  const demo =
    await client`select 1 from app.memberships m join app.organizations o on o.id=m.organization_id where m.user_id=${userId} and o.is_demo`;
  if (demo.length) throw new Error("Demo accounts cannot become staff.");
  await client`insert into app.staff_users(user_id) values(${userId}) on conflict do nothing`;
  console.log("Staff access granted.");
} finally {
  await client.end();
}
