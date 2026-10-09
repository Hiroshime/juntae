import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { voiceChannelInputSchema } from "@/lib/validation/voice";
import {
  VOICE_CHANNEL_LIMIT,
  voiceChannelNameKey,
  voiceRoomName,
  type VoiceChannelList,
} from "@/lib/voice";
import { AppError, assertFound } from "@/server/errors";
import { configuredLiveKit, createVoiceAccessToken } from "@/server/livekit";

type VoiceChannelInput = z.infer<typeof voiceChannelInputSchema>;

async function requireVoiceMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: {
        role: true,
        displayName: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    }),
    "Você não participa desta comunidade.",
  );
}

function reportLiveKitFailure(action: string, error: unknown) {
  console.warn(
    JSON.stringify({
      level: "warn",
      message: `LiveKit indisponível durante ${action}`,
      error: error instanceof Error ? error.name : "UnknownError",
    }),
  );
}

export async function listVoiceChannels(
  userId: string,
  communityId: string,
): Promise<VoiceChannelList> {
  const membership = await requireVoiceMembership(userId, communityId);
  const channels = await prisma.voiceChannel.findMany({
    where: { communityId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      maxParticipants: true,
    },
  });
  const liveKit = configuredLiveKit();
  let presenceAvailable = !liveKit;
  const counts = new Map<string, number>();

  if (liveKit && channels.length) {
    const names = channels.map((channel) => voiceRoomName(communityId, channel.id));
    try {
      const rooms = await liveKit.rooms.listRooms(names);
      for (const room of rooms) counts.set(room.name, room.numParticipants);
      presenceAvailable = true;
    } catch (error) {
      reportLiveKitFailure("consulta de presença", error);
    }
  }

  return {
    configured: Boolean(liveKit),
    presenceAvailable,
    canManage: membership.role !== "MEMBER",
    channels: channels.map((channel) => ({
      ...channel,
      participantCount: counts.get(voiceRoomName(communityId, channel.id)) ?? 0,
    })),
  };
}

export async function createVoiceChannel(
  userId: string,
  communityId: string,
  input: VoiceChannelInput,
) {
  const membership = await requireVoiceMembership(userId, communityId);
  if (membership.role === "MEMBER")
    throw new AppError("Apenas administradores podem criar salas de voz.", 403, "FORBIDDEN");

  try {
    return await prisma.$transaction(
      async (tx) => {
        const count = await tx.voiceChannel.count({ where: { communityId } });
        if (count >= VOICE_CHANNEL_LIMIT)
          throw new AppError(
            `A comunidade pode manter no máximo ${VOICE_CHANNEL_LIMIT} salas de voz.`,
            409,
            "VOICE_CHANNEL_LIMIT",
          );
        const last = await tx.voiceChannel.aggregate({
          where: { communityId },
          _max: { sortOrder: true },
        });
        return tx.voiceChannel.create({
          data: {
            communityId,
            createdById: userId,
            name: input.name,
            nameKey: voiceChannelNameKey(input.name),
            description: input.description,
            maxParticipants: input.maxParticipants,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
          },
          select: {
            id: true,
            name: true,
            description: true,
            maxParticipants: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AppError(
        "Já existe uma sala com esse nome na comunidade.",
        409,
        "VOICE_CHANNEL_NAME_TAKEN",
      );
    throw error;
  }
}

export async function deleteVoiceChannel(userId: string, communityId: string, channelId: string) {
  const membership = await requireVoiceMembership(userId, communityId);
  if (membership.role === "MEMBER")
    throw new AppError("Apenas administradores podem remover salas de voz.", 403, "FORBIDDEN");
  const channel = assertFound(
    await prisma.voiceChannel.findFirst({
      where: { id: channelId, communityId },
      select: { id: true },
    }),
    "Sala de voz não encontrada.",
  );

  const liveKit = configuredLiveKit();
  if (liveKit) {
    const room = voiceRoomName(communityId, channel.id);
    try {
      const [active] = await liveKit.rooms.listRooms([room]);
      if (active && active.numParticipants > 0)
        throw new AppError(
          "A sala não pode ser removida enquanto houver pessoas conectadas.",
          409,
          "VOICE_CHANNEL_OCCUPIED",
        );
      if (active) await liveKit.rooms.deleteRoom(room);
    } catch (error) {
      if (error instanceof AppError) throw error;
      reportLiveKitFailure("remoção de sala", error);
      throw new AppError(
        "Não foi possível confirmar se a sala está vazia. Tente novamente.",
        503,
        "VOICE_SERVICE_UNAVAILABLE",
      );
    }
  }

  await prisma.voiceChannel.delete({ where: { id: channel.id } });
}

export async function issueVoiceChannelToken(
  userId: string,
  communityId: string,
  channelId: string,
) {
  const membership = await requireVoiceMembership(userId, communityId);
  const channel = assertFound(
    await prisma.voiceChannel.findFirst({
      where: { id: channelId, communityId },
      select: { id: true, name: true, maxParticipants: true },
    }),
    "Sala de voz não encontrada.",
  );
  const liveKit = configuredLiveKit();
  if (!liveKit)
    throw new AppError("O servidor de voz ainda não foi configurado.", 503, "VOICE_NOT_CONFIGURED");

  const room = voiceRoomName(communityId, channel.id);
  try {
    const active = await liveKit.rooms.createRoom({
      name: room,
      emptyTimeout: 60,
      departureTimeout: 20,
      maxParticipants: channel.maxParticipants,
      metadata: JSON.stringify({ communityId, channelId: channel.id, name: channel.name }),
    });
    if (active.numParticipants >= channel.maxParticipants)
      throw new AppError("A sala atingiu o limite de participantes.", 409, "VOICE_CHANNEL_FULL");
    const name = membership.displayName || membership.user.name;
    const token = await createVoiceAccessToken({
      config: liveKit.config,
      room,
      identity: userId,
      name,
      metadata: JSON.stringify({ avatarUrl: membership.user.avatarUrl }),
    });
    return { token, serverUrl: liveKit.config.url, channel: { ...channel, room } };
  } catch (error) {
    if (error instanceof AppError) throw error;
    reportLiveKitFailure("entrada em sala", error);
    throw new AppError(
      "O servidor de voz está indisponível. Tente novamente em instantes.",
      503,
      "VOICE_SERVICE_UNAVAILABLE",
    );
  }
}
