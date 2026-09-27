import { ArenaPageView } from "@/features/games/arena-page-view";

export default async function ArenaMerchantsPage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  return <ArenaPageView section="MERCHANTS" slug={slug} />;
}
