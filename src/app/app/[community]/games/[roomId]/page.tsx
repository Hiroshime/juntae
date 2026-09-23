import { HangmanRoom } from "@/features/games/hangman-room";
import { StopRoom } from "@/features/games/stop-room";
import { TicTacToeRoom } from "@/features/games/tic-tac-toe-room";
import { gamePageContext } from "@/server/game-page";
import { getGameRoom } from "@/server/services/game-service";

export default async function GameRoomPage({
  params,
}: {
  params: Promise<{ community: string; roomId: string }>;
}) {
  const { community: slug, roomId } = await params;
  const { user, membership } = await gamePageContext(slug, `/${roomId}`);
  const room = await getGameRoom(user.id, membership.communityId, roomId);
  if (room.gameType === "HANGMAN") {
    return (
      <HangmanRoom communityId={membership.communityId} communitySlug={slug} initialRoom={room} />
    );
  }
  if (room.gameType === "STOP") {
    return (
      <StopRoom communityId={membership.communityId} communitySlug={slug} initialRoom={room} />
    );
  }
  return (
    <TicTacToeRoom communityId={membership.communityId} communitySlug={slug} initialRoom={room} />
  );
}
