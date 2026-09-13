import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";

export async function challengePageContext(slug: string, path = "") {
  const user = await requirePageUser(`/app/${slug}/challenges${path}`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  return { user, membership };
}
