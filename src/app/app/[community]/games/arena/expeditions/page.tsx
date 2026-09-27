import { ArenaPageView } from "@/features/games/arena-page-view";

export default async function ArenaExpeditionsPage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  return <ArenaPageView section="EXPEDITIONS" slug={slug} />;
}
