import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ShareActions } from "@/components/share-actions";
import { DeleteRandomizerRun } from "@/features/randomizers/delete-randomizer-run";
import {
  formatRandomizerResultText,
  randomizerPresetLabels,
} from "@/features/randomizers/randomizer-labels";
import { RandomizerResultView } from "@/features/randomizers/randomizer-result";
import { requirePageUser } from "@/lib/auth/page-session";
import type { RandomizerResult } from "@/lib/randomizer";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getRandomizerRun } from "@/server/services/randomizer-service";

export const dynamic = "force-dynamic";

export default async function SavedRandomizerPage({
  params,
}: {
  params: Promise<{ community: string; runId: string }>;
}) {
  const { community: slug, runId } = await params;
  const user = await requirePageUser(`/app/${slug}/randomizers/${runId}`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const run = await getRandomizerRun(user.id, membership.communityId, runId).catch(() => null);
  if (!run) notFound();
  const result = run.result as unknown as RandomizerResult;
  const title = run.title || randomizerPresetLabels[run.presetType];

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <Link className="small muted" href={`/app/${slug}/randomizers`}>
            ← Voltar para geradores
          </Link>
          <section className="card randomizer-result-card saved-randomizer-result">
            <div className="randomizer-result-celebration" aria-hidden="true">
              ✦ 🎲 ✦
            </div>
            <div className="card-header">
              <div>
                <div className="eyebrow">Resultado salvo</div>
                <h1>{title}</h1>
                <p className="muted small">
                  {randomizerPresetLabels[run.presetType]} · por {run.createdBy.name} em{" "}
                  {run.createdAt.toLocaleString("pt-BR")}
                </p>
              </div>
              <span className="role-badge">Snapshot preservado</span>
            </div>
            <RandomizerResultView result={result} />
            <ShareActions
              path={`/app/${slug}/randomizers/${run.id}`}
              text={formatRandomizerResultText(title, run.presetType, result)}
              title={title}
            />
            {run.canManage && (
              <DeleteRandomizerRun
                communityId={membership.communityId}
                communitySlug={slug}
                runId={run.id}
              />
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
