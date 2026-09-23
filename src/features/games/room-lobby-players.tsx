import type { GameRoomDetail } from "@/server/services/game-service";

export function RoomLobbyPlayers({
  room,
  capacity,
  showEmptySeats = false,
}: {
  room: Pick<GameRoomDetail, "createdById" | "players">;
  capacity: number;
  showEmptySeats?: boolean;
}) {
  const seats = showEmptySeats
    ? Array.from({ length: capacity }, (_, index) => index + 1)
    : room.players.map((player) => player.seat);

  return (
    <div className="game-player-list room-lobby-list">
      {seats.map((seat) => {
        const player = room.players.find((candidate) => candidate.seat === seat);
        const isHost = player?.userId === room.createdById;
        return (
          <div className={`game-player${player?.ready ? " is-ready" : ""}`} key={seat}>
            <span className="game-player-mark" aria-hidden="true">
              {isHost ? "★" : seat}
            </span>
            <div>
              <strong>{player?.name ?? "Vaga disponível"}</strong>
              <small>
                {player ? (isHost ? "Anfitrião da sala" : "Participante") : "Entre para jogar"}
              </small>
            </div>
            {player && (
              <span className={`room-player-state${player.ready ? " is-ready" : ""}`}>
                {player.ready ? "Pronto" : "Aguardando"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
