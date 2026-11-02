import { adminAuth } from "./lib/admin.mjs";
const userId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(userId ?? ""))
  throw new Error("Usage: npm run staff:create -- <existing-auth-user-uuid>");
const { error } = await adminAuth().rpc("provision_staff", { target_user: userId });
if (error) throw error;
console.log("Staff access granted.");
