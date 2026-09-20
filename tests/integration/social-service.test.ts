import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createSocialComment,
  createSocialPost,
  deleteSocialComment,
  deleteSocialPost,
  getSocialMedia,
  listSocialPosts,
  toggleSocialReaction,
} from "@/server/services/social-service";

describe("comunicação da comunidade", () => {
  const suffix = randomUUID();
  let communityId = "";
  let ownerId = "";
  let adminId = "";
  let memberId = "";
  let outsiderId = "";
  let image: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "admin", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `social-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [ownerId, adminId, memberId, outsiderId] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "Comunicação",
          slug: `social-${suffix}`,
          createdById: ownerId,
          members: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: adminId, role: "ADMIN" },
              { userId: memberId, role: "MEMBER", displayName: "Nome da comunidade" },
            ],
          },
        },
      })
    ).id;
    image = new Uint8Array(
      await sharp({ create: { width: 20, height: 20, channels: 3, background: "orange" } })
        .png()
        .toBuffer(),
    );
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, memberId, outsiderId].filter(Boolean) } },
    });
  });

  it("permite posts a membros, normaliza imagens e mantém o feed privado", async () => {
    const post = await createSocialPost(
      memberId,
      communityId,
      { kind: "POST", content: "Passeio confirmado!" },
      [{ bytes: image, name: "foto.png", declaredType: "image/png" }],
    );
    const feed = await listSocialPosts(ownerId, communityId);
    expect(feed.items[0]).toMatchObject({
      id: post.id,
      content: "Passeio confirmado!",
      author: { name: "Nome da comunidade" },
      canDelete: true,
    });
    const media = await getSocialMedia(ownerId, communityId, post.id, feed.items[0].media[0].id);
    expect(media.contentType).toBe("image/webp");
    expect((await sharp(media.data).metadata()).format).toBe("webp");
    await expect(listSocialPosts(outsiderId, communityId)).rejects.toMatchObject({ status: 404 });
    await expect(
      getSocialMedia(outsiderId, communityId, post.id, feed.items[0].media[0].id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("restringe comunicados a admins e exige conteúdo ou mídia", async () => {
    await expect(
      createSocialPost(memberId, communityId, { kind: "ANNOUNCEMENT", content: "Atenção" }, []),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createSocialPost(memberId, communityId, { kind: "POST", content: "" }, []),
    ).rejects.toMatchObject({ status: 400 });
    const post = await createSocialPost(
      adminId,
      communityId,
      { kind: "ANNOUNCEMENT", content: "Mudança de horário" },
      [],
    );
    expect((await listSocialPosts(memberId, communityId)).items[0]).toMatchObject({
      id: post.id,
      kind: "ANNOUNCEMENT",
      canDelete: false,
    });
  });

  it("alterna uma reação por pessoa e mantém as contagens", async () => {
    const post = await createSocialPost(
      ownerId,
      communityId,
      { kind: "POST", content: "Quem anima?" },
      [],
    );
    expect(await toggleSocialReaction(memberId, communityId, post.id, "LOVE")).toEqual({
      type: "LOVE",
    });
    let item = (await listSocialPosts(memberId, communityId)).items.find(
      (candidate) => candidate.id === post.id,
    )!;
    expect(item.reactions.LOVE).toBe(1);
    expect(item.myReaction).toBe("LOVE");
    await toggleSocialReaction(memberId, communityId, post.id, "LIKE");
    item = (await listSocialPosts(memberId, communityId)).items.find(
      (candidate) => candidate.id === post.id,
    )!;
    expect(item.reactions).toMatchObject({ LOVE: 0, LIKE: 1 });
    expect(await toggleSocialReaction(memberId, communityId, post.id, "LIKE")).toEqual({
      type: null,
    });
  });

  it("permite comentários e aplica remoção por autoria ou moderação", async () => {
    const post = await createSocialPost(
      memberId,
      communityId,
      { kind: "POST", content: "Vamos conversar" },
      [],
    );
    const comment = await createSocialComment(adminId, communityId, post.id, "Combinado!");
    const item = (await listSocialPosts(memberId, communityId)).items.find(
      (candidate) => candidate.id === post.id,
    )!;
    expect(item.comments[0]).toMatchObject({ id: comment.id, content: "Combinado!" });
    await expect(
      deleteSocialComment(memberId, communityId, post.id, comment.id),
    ).rejects.toMatchObject({ status: 403 });
    await deleteSocialComment(ownerId, communityId, post.id, comment.id);
    await expect(deleteSocialPost(outsiderId, communityId, post.id)).rejects.toMatchObject({
      status: 404,
    });
    await deleteSocialPost(adminId, communityId, post.id);
    expect(await prisma.socialPost.findUnique({ where: { id: post.id } })).toBeNull();
  });

  it("impede que um membro remova o post de outra pessoa", async () => {
    const post = await createSocialPost(
      ownerId,
      communityId,
      { kind: "POST", content: "Post do owner" },
      [],
    );
    await expect(deleteSocialPost(memberId, communityId, post.id)).rejects.toMatchObject({
      status: 403,
    });
  });
});
