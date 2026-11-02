import { adminAuth, ensureUser } from "./lib/admin.mjs";
if (!process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD)
  throw new Error("Set server-only DEMO_EMAIL and DEMO_PASSWORD.");
const user = await ensureUser(process.env.DEMO_EMAIL, process.env.DEMO_PASSWORD);
const { error } = await adminAuth().rpc("reset_demo", { demo_user_id: user.id });
if (error) throw error;
console.log(
  "Demo reset complete. Fictional records remain isolated in the read-only demo organization.",
);
