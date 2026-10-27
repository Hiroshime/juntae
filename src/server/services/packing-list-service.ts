import { Prisma, type CommunityRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  PackingListInput,
  PackingItemInput,
  PackingItemAction,
} from "@/lib/validation/packing-list";
import { AppError, assertFound } from "@/server/errors";

function canManage(userId: string, role: CommunityRole, createdById: string) {
  return userId === createdById || role === "OWNER" || role === "ADMIN";
}

async function membership(db: Prisma.TransactionClient, userId: string, communityId: string) {
  return assertFound(
    await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

async function validateEvent(
  db: Prisma.TransactionClient,
  communityId: string,
  eventId: string | null,
) {
  if (
    eventId &&
    !(await db.event.findFirst({ where: { id: eventId, communityId }, select: { id: true } }))
  ) {
    throw new AppError("Evento não encontrado nesta comunidade.", 400, "INVALID_EVENT");
  }
}

async function validateResponsible(
  db: Prisma.TransactionClient,
  communityId: string,
  userId: string | null,
) {
  if (
    userId &&
    !(await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    }))
  ) {
    throw new AppError("O responsável deve pertencer à comunidade.", 400, "INVALID_RESPONSIBLE");
  }
}

// Serialize mutations of a list so claiming, closing and editing cannot race each other.
async function mutateList<T>(
  userId: string,
  communityId: string,
  listId: string,
  operation: (
    db: Prisma.TransactionClient,
    list: { id: string; closed: boolean },
    manageable: boolean,
  ) => Promise<T>,
  allowClosed = false,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (db) => {
          const member = await membership(db, userId, communityId);
          const list = assertFound(
            await db.packingList.findFirst({ where: { id: listId, communityId } }),
            "Lista não encontrada.",
          );
          if (list.closed && !allowClosed)
            throw new AppError("Esta lista está fechada.", 409, "LIST_CLOSED");
          // A write lock also makes item changes conflict with closing the list.
          await db.packingList.update({ where: { id: list.id }, data: { updatedAt: new Date() } });
          return operation(db, list, canManage(userId, member.role, list.createdById));
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        if (attempt < 2) continue;
        throw new AppError("A lista mudou. Atualize a página e tente novamente.", 409, "CONFLICT");
      }
      throw error;
    }
  }
  throw new AppError("Atualize a lista e tente novamente.", 409);
}

function requireManager(manageable: boolean) {
  if (!manageable) throw new AppError("Você não pode administrar esta lista.", 403, "FORBIDDEN");
}

export async function createPackingList(
  userId: string,
  communityId: string,
  input: PackingListInput,
) {
  return prisma.$transaction(async (db) => {
    await membership(db, userId, communityId);
    await validateEvent(db, communityId, input.eventId);
    return db.packingList.create({ data: { ...input, communityId, createdById: userId } });
  });
}

export async function listPackingLists(
  userId: string,
  communityId: string,
  page = 1,
  eventId?: string,
) {
  await membership(prisma, userId, communityId);
  const where = { communityId, ...(eventId ? { eventId } : {}) };
  const [lists, count] = await Promise.all([
    prisma.packingList.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
      include: {
        event: { select: { id: true, title: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.packingList.count({ where }),
  ]);
  return { lists, count, page };
}

export async function getPackingListSources(
  userId: string,
  communityId: string,
  selectedEventId?: string,
) {
  await membership(prisma, userId, communityId);
  const [members, events] = await Promise.all([
    prisma.communityMember.findMany({
      where: { communityId },
      orderBy: { joinedAt: "asc" },
      select: { userId: true, displayName: true, user: { select: { name: true } } },
    }),
    prisma.event.findMany({
      where: { communityId },
      orderBy: { startsAt: "desc" },
      take: 200,
      select: { id: true, title: true },
    }),
  ]);
  // Keep event-page shortcuts usable even when the event is older than the picker window.
  if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
    const selected = await prisma.event.findFirst({
      where: { id: selectedEventId, communityId },
      select: { id: true, title: true },
    });
    if (selected) events.unshift(selected);
  }
  return {
    members: members.map((m) => ({ id: m.userId, name: m.displayName || m.user.name })),
    events,
  };
}

export async function getPackingList(userId: string, communityId: string, listId: string) {
  const member = await membership(prisma, userId, communityId);
  const list = assertFound(
    await prisma.packingList.findFirst({
      where: { id: listId, communityId },
      include: {
        event: { select: { id: true, title: true } },
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: {
            responsible: {
              select: {
                name: true,
                memberships: { where: { communityId }, select: { displayName: true } },
              },
            },
          },
        },
      },
    }),
    "Lista não encontrada.",
  );
  const manageable = canManage(userId, member.role, list.createdById);
  return {
    id: list.id,
    title: list.title,
    description: list.description,
    eventId: list.eventId,
    event: list.event,
    closed: list.closed,
    canManage: manageable,
    items: list.items.map((item) => {
      const mine = item.responsibleUserId === userId;
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        note: item.note,
        responsibleUserId: item.responsibleUserId,
        responsibleLabel: item.responsibleUserId ? item.responsibleLabel : null,
        responsibleName:
          item.responsible?.memberships[0]?.displayName || item.responsible?.name || null,
        responsibleIsMember: !!item.responsible?.memberships.length,
        delivered: item.delivered,
        mine,
        canEdit: manageable || mine || (!item.responsibleUserId && item.createdById === userId),
      };
    }),
  };
}

export async function updatePackingList(
  userId: string,
  communityId: string,
  listId: string,
  input: PackingListInput,
) {
  return mutateList(userId, communityId, listId, async (db, list, manageable) => {
    requireManager(manageable);
    await validateEvent(db, communityId, input.eventId);
    return db.packingList.update({ where: { id: list.id }, data: input });
  });
}

export async function setPackingListClosed(
  userId: string,
  communityId: string,
  listId: string,
  closed: boolean,
) {
  return mutateList(
    userId,
    communityId,
    listId,
    async (db, list, manageable) => {
      requireManager(manageable);
      return db.packingList.update({ where: { id: list.id }, data: { closed } });
    },
    true,
  );
}

export async function createPackingItem(
  userId: string,
  communityId: string,
  listId: string,
  input: PackingItemInput,
) {
  return mutateList(userId, communityId, listId, async (db, list, manageable) => {
    if (!manageable && input.responsibleUserId && input.responsibleUserId !== userId)
      requireManager(false);
    await validateResponsible(db, communityId, input.responsibleUserId);
    if ((await db.packingItem.count({ where: { listId } })) >= 300)
      throw new AppError("A lista aceita até 300 itens.");
    return db.packingItem.create({ data: { ...input, listId: list.id, createdById: userId } });
  });
}

export async function changePackingItem(
  userId: string,
  communityId: string,
  listId: string,
  itemId: string,
  change:
    | { type: "edit"; input: PackingItemInput }
    | { type: "delete" }
    | { type: "action"; input: PackingItemAction },
) {
  return mutateList(userId, communityId, listId, async (db, _list, manageable) => {
    const item = assertFound(
      await db.packingItem.findFirst({ where: { id: itemId, listId } }),
      "Item não encontrado.",
    );
    const mine = item.responsibleUserId === userId;
    if (change.type === "action") {
      const action = change.input;
      if (action.action === "claim") {
        if (item.responsibleUserId)
          throw new AppError(
            "Este item já tem responsável. Atualize a lista.",
            409,
            "ITEM_CLAIMED",
          );
        return db.packingItem.update({
          where: { id: itemId },
          data: {
            responsibleUserId: userId,
            responsibleLabel: action.responsibleLabel,
            delivered: false,
          },
        });
      }
      if (!mine && !manageable) requireManager(false);
      if (action.action === "release")
        return db.packingItem.update({
          where: { id: itemId },
          data: {
            responsibleUserId: null,
            responsibleLabel: null,
            delivered: false,
          },
        });
      if (!item.responsibleUserId)
        throw new AppError("Defina um responsável antes de marcar como levado.");
      return db.packingItem.update({
        where: { id: itemId },
        data: { delivered: action.delivered },
      });
    }
    if (!manageable && !mine && (item.responsibleUserId || item.createdById !== userId))
      requireManager(false);
    if (change.type === "delete") return db.packingItem.delete({ where: { id: itemId } });
    const input = change.input;
    if (!manageable && input.responsibleUserId && input.responsibleUserId !== userId)
      requireManager(false);
    await validateResponsible(db, communityId, input.responsibleUserId);
    return db.packingItem.update({
      where: { id: itemId },
      data: {
        ...input,
        delivered: input.responsibleUserId === item.responsibleUserId ? item.delivered : false,
      },
    });
  });
}

export type PackingListDetail = Awaited<ReturnType<typeof getPackingList>>;
