import type { SocialReactionType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SOCIAL_PAGE_SIZE } from "@/lib/social";
import type { SocialPostInput } from "@/lib/validation/social";
import { AppError, assertFound } from "@/server/errors";
import { prepareSocialMedia, type RawSocialMedia } from "@/server/social-media";

async function membership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

async function postInCommunity(communityId: string, postId: string) {
  return assertFound(
    await prisma.socialPost.findFirst({
      where: { id: postId, communityId },
      select: { id: true, authorId: true },
    }),
    "Publicação não encontrada.",
  );
}

function authorName(author: { name: string; memberships: { displayName: string | null }[] }) {
  return author.memberships[0]?.displayName || author.name;
}

export async function getSocialAccess(userId: string, communityId: string) {
  return membership(userId, communityId);
}

export async function createSocialPost(
  userId: string,
  communityId: string,
  input: SocialPostInput,
  files: RawSocialMedia[],
) {
  const member = await membership(userId, communityId);
  if (input.kind === "ANNOUNCEMENT" && member.role === "MEMBER")
    throw new AppError("Apenas administradores podem publicar comunicados.", 403, "FORBIDDEN");
  if (!input.content && !files.length)
    throw new AppError("Escreva uma mensagem ou adicione ao menos um anexo.");
  const media = await prepareSocialMedia(files);
  return prisma.socialPost.create({
    data: {
      communityId,
      authorId: userId,
      kind: input.kind,
      content: input.content || null,
      media: {
        create: media.map((item, sortOrder) => ({ ...item, sortOrder })),
      },
    },
    select: { id: true },
  });
}

export async function listSocialPosts(userId: string, communityId: string, page = 1) {
  const member = await membership(userId, communityId);
  const posts = await prisma.socialPost.findMany({
    where: { communityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * SOCIAL_PAGE_SIZE,
    take: SOCIAL_PAGE_SIZE + 1,
    select: {
      id: true,
      authorId: true,
      kind: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      author: {
        select: {
          name: true,
          avatarUrl: true,
          memberships: {
            where: { communityId },
            select: { displayName: true },
            take: 1,
          },
        },
      },
      media: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, kind: true, contentType: true, originalName: true, sizeBytes: true },
      },
      reactions: { select: { userId: true, type: true } },
      comments: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          authorId: true,
          content: true,
          createdAt: true,
          author: {
            select: {
              name: true,
              avatarUrl: true,
              memberships: {
                where: { communityId },
                select: { displayName: true },
                take: 1,
              },
            },
          },
        },
      },
      _count: { select: { comments: true } },
    },
  });
  const canModerate = member.role !== "MEMBER";
  return {
    role: member.role,
    page,
    hasNext: posts.length > SOCIAL_PAGE_SIZE,
    items: posts.slice(0, SOCIAL_PAGE_SIZE).map((post) => {
      const counts = Object.fromEntries(
        ["LIKE", "LOVE", "CELEBRATE", "LAUGH", "SUPPORT"].map((type) => [
          type,
          post.reactions.filter((reaction) => reaction.type === type).length,
        ]),
      ) as Record<SocialReactionType, number>;
      return {
        id: post.id,
        kind: post.kind,
        content: post.content,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        author: { name: authorName(post.author), avatarUrl: post.author.avatarUrl },
        media: post.media,
        reactions: counts,
        myReaction: post.reactions.find((reaction) => reaction.userId === userId)?.type ?? null,
        commentCount: post._count.comments,
        comments: post.comments.reverse().map((comment) => ({
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt.toISOString(),
          author: { name: authorName(comment.author), avatarUrl: comment.author.avatarUrl },
          canDelete: canModerate || comment.authorId === userId,
        })),
        canDelete: canModerate || post.authorId === userId,
      };
    }),
  };
}

export async function deleteSocialPost(userId: string, communityId: string, postId: string) {
  const [member, post] = await Promise.all([
    membership(userId, communityId),
    postInCommunity(communityId, postId),
  ]);
  if (post.authorId !== userId && member.role === "MEMBER")
    throw new AppError("Você não pode remover esta publicação.", 403, "FORBIDDEN");
  await prisma.socialPost.delete({ where: { id: postId } });
}

export async function createSocialComment(
  userId: string,
  communityId: string,
  postId: string,
  content: string,
) {
  await Promise.all([membership(userId, communityId), postInCommunity(communityId, postId)]);
  return prisma.socialComment.create({
    data: { postId, authorId: userId, content },
    select: { id: true },
  });
}

export async function deleteSocialComment(
  userId: string,
  communityId: string,
  postId: string,
  commentId: string,
) {
  const [member, comment] = await Promise.all([
    membership(userId, communityId),
    prisma.socialComment.findFirst({
      where: { id: commentId, postId, post: { communityId } },
      select: { authorId: true },
    }),
  ]);
  const found = assertFound(comment, "Comentário não encontrado.");
  if (found.authorId !== userId && member.role === "MEMBER")
    throw new AppError("Você não pode remover este comentário.", 403, "FORBIDDEN");
  await prisma.socialComment.delete({ where: { id: commentId } });
}

export async function toggleSocialReaction(
  userId: string,
  communityId: string,
  postId: string,
  type: SocialReactionType,
) {
  await Promise.all([membership(userId, communityId), postInCommunity(communityId, postId)]);
  return prisma.$transaction(async (db) => {
    const current = await db.socialReaction.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { type: true },
    });
    if (current?.type === type) {
      await db.socialReaction.delete({ where: { postId_userId: { postId, userId } } });
      return { type: null };
    }
    const reaction = await db.socialReaction.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, type },
      update: { type, createdAt: new Date() },
      select: { type: true },
    });
    return reaction;
  });
}

export async function getSocialMedia(
  userId: string,
  communityId: string,
  postId: string,
  mediaId: string,
) {
  await membership(userId, communityId);
  return assertFound(
    await prisma.socialMedia.findFirst({
      where: { id: mediaId, postId, post: { communityId } },
      select: { data: true, contentType: true, originalName: true },
    }),
    "Anexo não encontrado.",
  );
}

export async function findSocialHighlight(communityId: string) {
  const posts = await prisma.socialPost.findMany({
    where: { communityId },
    orderBy: { createdAt: "desc" },
    take: SOCIAL_PAGE_SIZE,
    select: {
      id: true,
      kind: true,
      content: true,
      createdAt: true,
      author: {
        select: {
          name: true,
          memberships: {
            where: { communityId },
            select: { displayName: true },
            take: 1,
          },
        },
      },
      _count: { select: { comments: true, reactions: true, media: true } },
    },
  });
  const highlighted = posts
    .map((post, index) => ({
      post,
      score:
        post._count.comments * 2 +
        post._count.reactions +
        (post.kind === "ANNOUNCEMENT" ? 2 : 0) -
        index * 0.05,
    }))
    .sort((first, second) => second.score - first.score)[0]?.post;
  if (!highlighted) return null;
  return {
    id: highlighted.id,
    kind: highlighted.kind,
    content: highlighted.content,
    createdAt: highlighted.createdAt,
    authorName: authorName(highlighted.author),
    commentCount: highlighted._count.comments,
    reactionCount: highlighted._count.reactions,
    mediaCount: highlighted._count.media,
  };
}
