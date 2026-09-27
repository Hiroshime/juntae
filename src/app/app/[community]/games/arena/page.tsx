import { ArenaPageView } from "@/features/games/arena-page-view";

export default async function ArenaPage({ params }: { params: Promise<{ community: string }> }) {
  const { community: slug } = await params;
  return <ArenaPageView section="VILLAGE" slug={slug} />;
}
