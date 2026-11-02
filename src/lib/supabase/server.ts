import "server-only";
import { cache } from "react";
import { authClient, requireUser } from "../auth/server";
import { verifyUserClient } from "./security";
/** The SSR client forwards the current user's JWT. No database password or admin key. */
export const userDataClient = cache(async () => {
  const user = await requireUser();
  const client = await authClient();
  await verifyUserClient(client, user.id);
  return client;
});
