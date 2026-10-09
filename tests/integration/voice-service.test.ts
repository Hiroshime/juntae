import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { voiceChannelInputSchema } from "@/lib/validation/voice";
import {
  createVoiceChannel,
  deleteVoiceChannel,
  issueVoiceChannelToken,
  listVoiceChannels,
} from "@/server/services/voice-service";

describe("canais de voz privados", () => {
  const suffix = randomUUID();
  let communityId = "";
  let ownerId = "";
  let adminId = "";
  let memberId = "";
  let outsiderId = "";

  beforeAll(async () => {
    vi.stubEnv("LIVEKIT_URL", "");
    vi.stubEnv("LIVEKIT_API_KEY", "");
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    const users = await Promise.all(
      ["owner", "admin", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `voice-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [ownerId, adminId, memberId, outsiderId] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "Voz",
          slug: `voice-${suffix}`,
          createdById: ownerId,
          members: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: adminId, role: "ADMIN" },
              { userId: memberId, role: "MEMBER", displayName: "Nome na comunidade" },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, memberId, outsiderId].filter(Boolean) } },
    });
  });

  it("permite administração por owner/admin e lista para membros", async () => {
    const general = await createVoiceChannel(
      ownerId,
      communityId,
      voiceChannelInputSchema.parse({
        name: "Geral",
        description: "Sala principal",
        maxParticipants: 12,
      }),
    );
    const adminChannel = await createVoiceChannel(
      adminId,
      communityId,
      voiceChannelInputSchema.parse({ name: "Jogos", maxParticipants: 8 }),
    );

    await expect(listVoiceChannels(memberId, communityId)).resolves.toMatchObject({
      configured: false,
      presenceAvailable: true,
      canManage: false,
      channels: [
        { id: general.id, name: "Geral", participantCount: 0 },
        { id: adminChannel.id, name: "Jogos", participantCount: 0 },
      ],
    });
    await deleteVoiceChannel(adminId, communityId, adminChannel.id);
    expect(await prisma.voiceChannel.findUnique({ where: { id: adminChannel.id } })).toBeNull();
  });

  it("bloqueia administração comum, duplicidade normalizada e acesso externo", async () => {
    const input = voiceChannelInputSchema.parse({ name: "Reunião", maxParticipants: 5 });
    await expect(createVoiceChannel(memberId, communityId, input)).rejects.toMatchObject({
      status: 403,
    });
    const channel = await createVoiceChannel(ownerId, communityId, input);
    await expect(
      createVoiceChannel(
        adminId,
        communityId,
        voiceChannelInputSchema.parse({ name: "  REUNIAO ", maxParticipants: 5 }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_CHANNEL_NAME_TAKEN", status: 409 });
    await expect(deleteVoiceChannel(memberId, communityId, channel.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(listVoiceChannels(outsiderId, communityId)).rejects.toMatchObject({ status: 404 });
  });

  it("não emite token quando o serviço externo não está configurado", async () => {
    const channel = await prisma.voiceChannel.findFirstOrThrow({ where: { communityId } });
    await expect(issueVoiceChannelToken(memberId, communityId, channel.id)).rejects.toMatchObject({
      code: "VOICE_NOT_CONFIGURED",
      status: 503,
    });
  });
});
