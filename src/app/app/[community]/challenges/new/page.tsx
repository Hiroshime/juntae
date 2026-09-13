import { ChallengeForm } from "@/features/challenges/challenge-form";
import { challengePageContext } from "@/server/challenge-page";

export default async function NewChallengePage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  const { user, membership } = await challengePageContext(slug, "/new");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Novo desafio</div>
          <h1>Qual vai ser a meta da turma?</h1>
          <p className="lead">Defina o combinado antes de convidar os participantes.</p>
        </div>
      </div>
      <ChallengeForm communityId={membership.communityId} slug={slug} timezone={user.timezone} />
    </>
  );
}
