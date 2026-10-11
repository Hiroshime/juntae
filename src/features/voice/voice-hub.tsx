"use client";

import {
  LiveKitRoom,
  MediaDeviceMenu,
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useParticipantInfo,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, LocalAudioTrack, Track, type Participant } from "livekit-client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/avatar";
import {
  parseVoiceParticipantMetadata,
  type VoiceChannelList,
  type VoiceChannelSummary,
} from "@/lib/voice";

type VoiceSession = {
  token: string;
  serverUrl: string;
  channel: VoiceChannelSummary & { room: string };
};

async function responseError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : fallback;
}

function ParticipantCard({ participant }: { participant: Participant }) {
  const speaking = useIsSpeaking(participant);
  const { identity, name, metadata } = useParticipantInfo({ participant });
  const profile = parseVoiceParticipantMetadata(metadata);
  const displayName = name || identity || "Participante";
  const sharingScreen = participant.isScreenShareEnabled;
  return (
    <li className={`voice-participant${speaking ? " speaking" : ""}`}>
      <div className="voice-avatar-wrap">
        <Avatar name={displayName} url={profile.avatarUrl} size="large" />
        <span className="voice-speaking-ring" aria-hidden="true" />
      </div>
      <div>
        <strong>{displayName}</strong>
        <span>
          {participant.isLocal ? "Você" : speaking ? "Falando agora" : "Na sala"}
          {!participant.isMicrophoneEnabled ? " · microfone desligado" : ""}
          {sharingScreen ? " · compartilhando tela" : ""}
        </span>
      </div>
      <span
        className="voice-mic-state"
        aria-label={participant.isMicrophoneEnabled ? "Microfone ligado" : "Microfone desligado"}
      >
        {participant.isMicrophoneEnabled ? "●" : "⊘"}
      </span>
    </li>
  );
}

function VoiceRoom({
  channel,
  onLeave,
}: {
  channel: VoiceSession["channel"];
  onLeave: () => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const connection = useConnectionState();
  const { isMicrophoneEnabled, isScreenShareEnabled, localParticipant, microphoneTrack } =
    useLocalParticipant();
  const screenShareTracks = useTracks([Track.Source.ScreenShare]).filter(
    ({ publication }) => !publication.isMuted,
  );
  const activeScreenShare =
    screenShareTracks.find(
      ({ participant }) => participant.identity === localParticipant.identity,
    ) ?? screenShareTracks[0];
  const remotePresenter =
    activeScreenShare !== undefined &&
    activeScreenShare.participant.identity !== localParticipant.identity;
  const presenterName = activeScreenShare
    ? activeScreenShare.participant.name || activeScreenShare.participant.identity || "Participante"
    : null;
  const [deafened, setDeafened] = useState(false);
  const [changingMicrophone, setChangingMicrophone] = useState(false);
  const [changingScreenShare, setChangingScreenShare] = useState(false);
  const [controlError, setControlError] = useState("");
  const screenStageRef = useRef<HTMLDivElement>(null);
  const screenShareSupported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
  const localMicrophoneTrack =
    microphoneTrack?.track instanceof LocalAudioTrack ? microphoneTrack.track : undefined;

  const connectionLabel =
    connection === ConnectionState.Connected
      ? "Conectado"
      : connection === ConnectionState.Reconnecting
        ? "Reconectando"
        : connection === ConnectionState.Connecting
          ? "Conectando"
          : "Desconectado";

  async function toggleMicrophone() {
    setChangingMicrophone(true);
    setControlError("");
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setControlError(
        "Não foi possível acessar o microfone. Confira a permissão do navegador e o dispositivo selecionado.",
      );
    } finally {
      setChangingMicrophone(false);
    }
  }

  async function toggleScreenShare() {
    if (!screenShareSupported) {
      setControlError("Este navegador não oferece compartilhamento de tela.");
      return;
    }
    if (!isScreenShareEnabled && remotePresenter) {
      setControlError(`${presenterName ?? "Outra pessoa"} já está compartilhando a tela.`);
      return;
    }

    setChangingScreenShare(true);
    setControlError("");
    try {
      await localParticipant.setScreenShareEnabled(
        !isScreenShareEnabled,
        isScreenShareEnabled
          ? undefined
          : {
              audio: true,
              video: true,
              selfBrowserSurface: "exclude",
              surfaceSwitching: "include",
              systemAudio: "include",
              contentHint: "detail",
            },
      );
    } catch (error) {
      const cancelled =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "AbortError");
      setControlError(
        cancelled
          ? "O compartilhamento foi cancelado ou não recebeu permissão."
          : "Não foi possível compartilhar a tela. Confira as permissões do navegador.",
      );
    } finally {
      setChangingScreenShare(false);
    }
  }

  async function openScreenShareFullscreen() {
    setControlError("");
    try {
      await screenStageRef.current?.requestFullscreen();
    } catch {
      setControlError("Não foi possível abrir a apresentação em tela cheia.");
    }
  }

  return (
    <section className="card voice-room-panel" aria-labelledby="active-voice-room">
      <RoomAudioRenderer muted={deafened} />
      <div className="voice-room-header">
        <div>
          <div className="eyebrow">Sala ativa</div>
          <h2 id="active-voice-room">{channel.name}</h2>
          <p>{channel.description || "Converse por voz com a comunidade."}</p>
        </div>
        <span className={`voice-connection-state state-${connection}`} role="status">
          <i aria-hidden="true" /> {connectionLabel}
        </span>
      </div>

      <StartAudio
        className="button secondary voice-start-audio"
        label="Permitir reprodução de áudio"
      />

      {activeScreenShare && (
        <section className="voice-screen-share" aria-labelledby="voice-screen-share-title">
          <div className="voice-screen-share-header">
            <div>
              <span>Apresentação ao vivo</span>
              <strong id="voice-screen-share-title">
                {activeScreenShare.participant.identity === localParticipant.identity
                  ? "Sua tela"
                  : `Tela de ${presenterName}`}
              </strong>
            </div>
            <button
              className="button secondary small"
              onClick={() => void openScreenShareFullscreen()}
              type="button"
            >
              <span aria-hidden="true">⛶</span> Tela cheia
            </button>
          </div>
          <div className="voice-screen-share-stage" ref={screenStageRef}>
            <VideoTrack playsInline trackRef={activeScreenShare} />
          </div>
        </section>
      )}

      <ul className="voice-participant-list" aria-label="Pessoas conectadas">
        {participants.map((participant) => (
          <ParticipantCard key={participant.identity} participant={participant} />
        ))}
      </ul>

      <div className="voice-room-summary" aria-live="polite">
        {participants.length} de {channel.maxParticipants} pessoas conectadas
      </div>

      {controlError && (
        <div className="error" role="alert">
          {controlError}
        </div>
      )}

      <div className="voice-controls" aria-label="Controles da chamada">
        <button
          className={`voice-control${isMicrophoneEnabled ? " active" : ""}`}
          disabled={changingMicrophone || connection !== ConnectionState.Connected}
          onClick={toggleMicrophone}
          type="button"
        >
          <span aria-hidden="true">{isMicrophoneEnabled ? "🎙" : "🔇"}</span>
          {changingMicrophone
            ? "Aguarde…"
            : isMicrophoneEnabled
              ? "Desligar microfone"
              : "Ligar microfone"}
        </button>
        <button
          aria-pressed={deafened}
          className={`voice-control${deafened ? " active" : ""}`}
          onClick={() => setDeafened((current) => !current)}
          type="button"
        >
          <span aria-hidden="true">{deafened ? "🔕" : "🎧"}</span>
          {deafened ? "Ativar áudio" : "Desativar áudio"}
        </button>
        <MediaDeviceMenu
          className="voice-control voice-device-menu"
          kind="audioinput"
          requestPermissions={isMicrophoneEnabled}
          tracks={{ audioinput: localMicrophoneTrack }}
        >
          <span aria-hidden="true">⚙</span> Microfone
        </MediaDeviceMenu>
        <button
          aria-pressed={isScreenShareEnabled}
          className={`voice-control${isScreenShareEnabled ? " active" : ""}`}
          disabled={
            changingScreenShare ||
            connection !== ConnectionState.Connected ||
            (!isScreenShareEnabled && (remotePresenter || !screenShareSupported))
          }
          onClick={() => void toggleScreenShare()}
          title={
            !screenShareSupported
              ? "Seu navegador não oferece compartilhamento de tela"
              : remotePresenter
                ? `${presenterName ?? "Outra pessoa"} já está compartilhando`
                : undefined
          }
          type="button"
        >
          <span aria-hidden="true">{isScreenShareEnabled ? "⏹" : "🖥"}</span>
          {changingScreenShare
            ? "Aguarde…"
            : isScreenShareEnabled
              ? "Parar compartilhamento"
              : remotePresenter
                ? "Tela em uso"
                : "Compartilhar tela"}
        </button>
        <button
          className="voice-control danger"
          onClick={() => void room.disconnect().finally(onLeave)}
          type="button"
        >
          <span aria-hidden="true">↙</span> Sair da sala
        </button>
      </div>
    </section>
  );
}

export function VoiceHub({
  communityId,
  initialData,
}: {
  communityId: string;
  initialData: VoiceChannelList;
}) {
  const [data, setData] = useState(initialData);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const refreshing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (cancelled || refreshing.current || document.visibilityState !== "visible") return;
      refreshing.current = true;
      try {
        const response = await fetch(`/api/communities/${communityId}/voice/channels`, {
          cache: "no-store",
        });
        if (response.ok && !cancelled) setData((await response.json()) as VoiceChannelList);
      } finally {
        refreshing.current = false;
      }
    }
    const timer = window.setInterval(refresh, 6_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [communityId]);

  async function join(channel: VoiceChannelSummary) {
    setJoiningId(channel.id);
    setGlobalError("");
    try {
      const response = await fetch(
        `/api/communities/${communityId}/voice/channels/${channel.id}/token`,
        { method: "POST" },
      );
      if (!response.ok)
        throw new Error(await responseError(response, "Não foi possível entrar na sala."));
      setSession((await response.json()) as VoiceSession);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Não foi possível entrar na sala.");
    } finally {
      setJoiningId(null);
    }
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setGlobalError("");
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const response = await fetch(`/api/communities/${communityId}/voice/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          description: fields.get("description"),
          maxParticipants: fields.get("maxParticipants"),
        }),
      });
      if (!response.ok)
        throw new Error(await responseError(response, "Não foi possível criar a sala."));
      const channel = (await response.json()) as VoiceChannelSummary;
      setData((current) => ({ ...current, channels: [...current.channels, channel] }));
      form.reset();
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Não foi possível criar a sala.");
    } finally {
      setCreating(false);
    }
  }

  async function removeChannel(channel: VoiceChannelSummary) {
    if (!window.confirm(`Remover a sala “${channel.name}”?`)) return;
    setDeletingId(channel.id);
    setGlobalError("");
    try {
      const response = await fetch(`/api/communities/${communityId}/voice/channels/${channel.id}`, {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error(await responseError(response, "Não foi possível remover a sala."));
      setData((current) => ({
        ...current,
        channels: current.channels.filter((candidate) => candidate.id !== channel.id),
      }));
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Não foi possível remover a sala.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="voice-hub">
      {!data.configured && (
        <div className="voice-setup-notice" role="status">
          <span aria-hidden="true">⚙</span>
          <div>
            <strong>Servidor de voz aguardando configuração</strong>
            <p>
              As salas já podem ser organizadas. Para liberar as chamadas, configure{" "}
              <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code> e{" "}
              <code>LIVEKIT_API_SECRET</code> no container do Juntaê.
            </p>
          </div>
        </div>
      )}
      {data.configured && !data.presenceAvailable && (
        <div className="warning" role="status">
          O servidor de voz está configurado, mas não respondeu à consulta de presença. As últimas
          contagens foram preservadas.
        </div>
      )}
      {globalError && (
        <div className="error voice-global-error" role="alert">
          {globalError}
        </div>
      )}

      <div className="voice-layout">
        <section className="card voice-channel-browser" aria-labelledby="voice-channels-title">
          <div className="card-header">
            <div>
              <div className="eyebrow">Canais</div>
              <h2 id="voice-channels-title">Escolha uma sala</h2>
            </div>
            <span className="voice-private-badge">Privado</span>
          </div>
          {data.channels.length ? (
            <ul className="voice-channel-list">
              {data.channels.map((channel) => {
                const full = channel.participantCount >= channel.maxParticipants;
                const active = session?.channel.id === channel.id;
                return (
                  <li className={`voice-channel${active ? " active" : ""}`} key={channel.id}>
                    <div className="voice-channel-icon" aria-hidden="true">
                      ◖))
                    </div>
                    <div className="voice-channel-copy">
                      <strong>{channel.name}</strong>
                      <p>{channel.description || "Sala de conversa da comunidade."}</p>
                      <span>
                        {channel.participantCount}/{channel.maxParticipants} conectados
                      </span>
                    </div>
                    <div className="voice-channel-actions">
                      <button
                        className="button secondary"
                        disabled={
                          !data.configured || full || Boolean(session) || joiningId === channel.id
                        }
                        onClick={() => join(channel)}
                        type="button"
                      >
                        {active
                          ? "Na sala"
                          : joiningId === channel.id
                            ? "Entrando…"
                            : full
                              ? "Lotada"
                              : "Entrar"}
                      </button>
                      {data.canManage && !active && (
                        <button
                          aria-label={`Remover sala ${channel.name}`}
                          className="voice-delete-channel"
                          disabled={deletingId === channel.id}
                          onClick={() => removeChannel(channel)}
                          type="button"
                        >
                          {deletingId === channel.id ? "…" : "×"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="voice-empty-state">
              <span aria-hidden="true">🎙</span>
              <strong>Nenhuma sala criada</strong>
              <p>Administradores podem abrir a primeira sala da comunidade.</p>
            </div>
          )}

          {data.canManage && (
            <details className="voice-create-details">
              <summary>Adicionar sala de voz</summary>
              <form className="voice-create-form" onSubmit={createChannel}>
                <label>
                  Nome
                  <input
                    maxLength={60}
                    minLength={2}
                    name="name"
                    placeholder="Ex.: Resenha"
                    required
                  />
                </label>
                <label>
                  Descrição <span className="muted">(opcional)</span>
                  <input
                    maxLength={160}
                    name="description"
                    placeholder="Assunto ou finalidade da sala"
                  />
                </label>
                <label>
                  Limite de pessoas
                  <input
                    defaultValue="12"
                    max={50}
                    min={2}
                    name="maxParticipants"
                    required
                    type="number"
                  />
                </label>
                <button className="button" disabled={creating} type="submit">
                  {creating ? "Criando…" : "Criar sala"}
                </button>
              </form>
            </details>
          )}
        </section>

        {session ? (
          <LiveKitRoom
            audio={false}
            connect
            onDisconnected={() => setSession(null)}
            onError={(error) => setGlobalError(error.message || "A conexão de voz falhou.")}
            serverUrl={session.serverUrl}
            token={session.token}
            video={false}
          >
            <VoiceRoom channel={session.channel} onLeave={() => setSession(null)} />
          </LiveKitRoom>
        ) : (
          <section className="card voice-welcome" aria-labelledby="voice-welcome-title">
            <div className="voice-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div>
              <div className="eyebrow">Conversa ao vivo</div>
              <h2 id="voice-welcome-title">Entre, fale e fique à vontade</h2>
              <p>
                Escolha uma sala. Você entra com o microfone desligado e decide quando quer falar ou
                apresentar uma tela.
              </p>
            </div>
            <ul className="voice-feature-list">
              <li>
                <span aria-hidden="true">🔒</span> Apenas membros da comunidade
              </li>
              <li>
                <span aria-hidden="true">🎙</span> Controle do microfone e dispositivo
              </li>
              <li>
                <span aria-hidden="true">〽</span> Indicador de quem está falando
              </li>
              <li>
                <span aria-hidden="true">🖥</span> Compartilhamento de tela, janela ou aba
              </li>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
