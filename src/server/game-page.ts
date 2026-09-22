import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";

export async function gamePageContext(slug: string, path = "") {
  const user = await requirePageUser(`/app/${slug}/games${path}`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  return { user, membership };
}
