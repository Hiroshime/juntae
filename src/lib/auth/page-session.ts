import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export async function requirePageUser(returnTo: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}
