import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { packingItemSchema, packingListSchema } from "@/lib/validation/packing-list";
import {
  createPackingItem,
  createPackingList,
  getPackingList,
  listPackingLists,
  changePackingItem,
  updatePackingList,
  setPackingListClosed,
} from "@/server/services/packing-list-service";
import { POST as postList } from "@/app/api/communities/[communityId]/packing-lists/route";
import { PATCH as patchItem } from "@/app/api/communities/[communityId]/packing-lists/[listId]/items/[itemId]/route";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/server/authorization", () => ({
  requireAuthenticatedUser: async () => ({ id: session.userId }),
  AuthorizationError: class extends Error {},
}));

describe("listas de contribuições", () => {
  const suffix = randomUUID();
  let owner = "",
    creator = "",
    member = "",
    outsider = "",
    communityId = "",
    foreignId = "",
    eventId = "",
    foreignEventId = "";
  const listInput = (extra = {}) => packingListSchema.parse({ title: "Café da manhã", ...extra });
  const itemInput = (extra = {}) =>
    packingItemSchema.parse({ name: "Leite", quantity: "2 litros", ...extra });
  const createList = () => createPackingList(creator, communityId, listInput());
  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "creator", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: { name, email: `packing-${name}-${suffix}@test.local`, passwordHash: "unused" },
        }),
      ),
    );
    [owner, creator, member, outsider] = users.map((user) => user.id);
    session.userId = creator;
    const community = await prisma.community.create({
      data: {
        name: "Listas",
        slug: `packing-${suffix}`,
        createdById: owner,
        members: {
          create: [
            { userId: owner, role: "OWNER" },
            { userId: creator },
            { userId: member, displayName: "Kelvin" },
          ],
        },
      },
    });
    communityId = community.id;
    const foreign = await prisma.community.create({
      data: {
        name: "Outra",
        slug: `packing-other-${suffix}`,
        createdById: outsider,
        members: { create: { userId: outsider, role: "OWNER" } },
      },
    });
    foreignId = foreign.id;
    const [event, foreignEvent] = await Promise.all(
      [communityId, foreignId].map((id) =>
        prisma.event.create({
          data: {
            communityId: id,
            createdById: id === communityId ? owner : outsider,
            title: "Chácara",
            startsAt: new Date("2027-01-01T12:00:00Z"),
          },
        }),
      ),
    );
    eventId = event.id;
    foreignEventId = foreignEvent.id;
  });
  beforeEach(async () => {
    session.userId = creator;
    await prisma.packingList.deleteMany({
      where: { communityId: { in: [communityId, foreignId] } },
    });
  });
  afterAll(async () => {
    await prisma.community.deleteMany({
      where: { id: { in: [communityId, foreignId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner, creator, member, outsider].filter(Boolean) } },
    });
  });

  it("cria listas independentes e várias listas no mesmo evento; permite desvincular", async () => {
    const independent = await createList();
    expect(independent.eventId).toBeNull();
    const first = await createPackingList(creator, communityId, listInput({ eventId }));
    await createPackingList(member, communityId, listInput({ eventId, title: "Churrasco" }));
    expect((await listPackingLists(member, communityId, 1, eventId)).count).toBe(2);
    await updatePackingList(creator, communityId, first.id, listInput());
    expect((await getPackingList(member, communityId, first.id)).event).toBeNull();
    await expect(
      createPackingList(creator, communityId, listInput({ eventId: foreignEventId })),
    ).rejects.toMatchObject({ code: "INVALID_EVENT" });
    await expect(
      updatePackingList(creator, communityId, first.id, listInput({ eventId: foreignEventId })),
    ).rejects.toMatchObject({ code: "INVALID_EVENT" });
  });

  it("atribui casal com contato, respeita apelido e permite gerir a própria contribuição", async () => {
    const list = await createList();
    const item = await createPackingItem(
      creator,
      communityId,
      list.id,
      itemInput({ responsibleUserId: member, responsibleLabel: "Kelvin e Ana" }),
    );
    const detail = await getPackingList(member, communityId, list.id);
    expect(detail.items[0]).toMatchObject({
      responsibleLabel: "Kelvin e Ana",
      responsibleName: "Kelvin",
      mine: true,
      canEdit: true,
    });
    await changePackingItem(member, communityId, list.id, item.id, {
      type: "edit",
      input: itemInput({
        name: "Café",
        responsibleUserId: member,
        responsibleLabel: "Kelvin e Ana",
      }),
    });
    await changePackingItem(member, communityId, list.id, item.id, {
      type: "action",
      input: { action: "delivered", delivered: true },
    });
    await changePackingItem(member, communityId, list.id, item.id, {
      type: "action",
      input: { action: "release" },
    });
    expect((await getPackingList(owner, communityId, list.id)).items[0]).toMatchObject({
      responsibleUserId: null,
      responsibleLabel: null,
      delivered: false,
    });
  });

  it("impede atribuir a terceiros, interferir em contribuições e administrar lista alheia", async () => {
    const list = await createList();
    await expect(
      createPackingItem(member, communityId, list.id, itemInput({ responsibleUserId: owner })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createPackingItem(creator, communityId, list.id, itemInput({ responsibleUserId: outsider })),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSIBLE" });
    const item = await createPackingItem(
      creator,
      communityId,
      list.id,
      itemInput({ responsibleUserId: creator }),
    );
    for (const change of [
      { type: "delete" as const },
      { type: "edit" as const, input: itemInput({ responsibleUserId: member }) },
      { type: "action" as const, input: { action: "release" as const } },
      { type: "action" as const, input: { action: "delivered" as const, delivered: true } },
    ])
      await expect(
        changePackingItem(member, communityId, list.id, item.id, change),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      updatePackingList(member, communityId, list.id, listInput()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(setPackingListClosed(member, communityId, list.id, true)).rejects.toMatchObject({
      status: 403,
    });
    await changePackingItem(owner, communityId, list.id, item.id, {
      type: "edit",
      input: itemInput({ responsibleUserId: member }),
    });
    await expect(
      changePackingItem(member, communityId, list.id, item.id, {
        type: "edit",
        input: itemInput({ responsibleUserId: owner }),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("apenas um membro consegue assumir o mesmo item concorrentemente", async () => {
    const list = await createList();
    const item = await createPackingItem(creator, communityId, list.id, itemInput());
    const results = await Promise.allSettled(
      [creator, member].map((id) =>
        changePackingItem(id, communityId, list.id, item.id, {
          type: "action",
          input: { action: "claim", responsibleLabel: null },
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toMatchObject({ code: "ITEM_CLAIMED" });
    expect([creator, member]).toContain(
      (await getPackingList(owner, communityId, list.id)).items[0].responsibleUserId,
    );
  });

  it("protege item criado pelo membro depois de outra pessoa assumi-lo", async () => {
    const list = await createList();
    const item = await createPackingItem(member, communityId, list.id, itemInput());
    await changePackingItem(member, communityId, list.id, item.id, {
      type: "edit",
      input: itemInput({ name: "Pão" }),
    });
    await changePackingItem(owner, communityId, list.id, item.id, {
      type: "action",
      input: { action: "claim", responsibleLabel: null },
    });
    await expect(
      changePackingItem(member, communityId, list.id, item.id, { type: "delete" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      changePackingItem(member, communityId, list.id, item.id, {
        type: "edit",
        input: itemInput(),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("bloqueia todas as alterações ao fechar e preserva itens ao reabrir", async () => {
    const list = await createList();
    const item = await createPackingItem(creator, communityId, list.id, itemInput());
    await expect(
      changePackingItem(creator, communityId, list.id, item.id, {
        type: "action",
        input: { action: "delivered", delivered: true },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await setPackingListClosed(owner, communityId, list.id, true);
    await expect(
      createPackingItem(creator, communityId, list.id, itemInput()),
    ).rejects.toMatchObject({ code: "LIST_CLOSED" });
    await expect(
      updatePackingList(creator, communityId, list.id, listInput()),
    ).rejects.toMatchObject({ code: "LIST_CLOSED" });
    for (const change of [
      { type: "delete" as const },
      { type: "edit" as const, input: itemInput() },
      { type: "action" as const, input: { action: "claim" as const, responsibleLabel: null } },
    ]) {
      await expect(
        changePackingItem(creator, communityId, list.id, item.id, change),
      ).rejects.toMatchObject({ code: "LIST_CLOSED" });
    }
    await setPackingListClosed(creator, communityId, list.id, false);
    expect((await getPackingList(member, communityId, list.id)).items).toHaveLength(1);
    await changePackingItem(creator, communityId, list.id, item.id, { type: "delete" });
    expect((await getPackingList(member, communityId, list.id)).items).toHaveLength(0);
  });

  it("não expõe dados entre comunidades nem permite usar item de outra lista", async () => {
    const list = await createList();
    const other = await createList();
    const item = await createPackingItem(creator, communityId, other.id, itemInput());
    await expect(getPackingList(outsider, communityId, list.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getPackingList(outsider, foreignId, list.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(createPackingList(outsider, communityId, listInput())).rejects.toMatchObject({
      status: 404,
    });
    await expect(listPackingLists(outsider, communityId)).rejects.toMatchObject({ status: 404 });
    await expect(
      changePackingItem(creator, communityId, list.id, item.id, { type: "delete" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createPackingItem(outsider, foreignId, list.id, itemInput()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("reseta levado quando o organizador troca o responsável", async () => {
    const list = await createList();
    const item = await createPackingItem(
      creator,
      communityId,
      list.id,
      itemInput({ responsibleUserId: member }),
    );
    await changePackingItem(member, communityId, list.id, item.id, {
      type: "action",
      input: { action: "delivered", delivered: true },
    });
    await changePackingItem(owner, communityId, list.id, item.id, {
      type: "edit",
      input: itemInput({ responsibleUserId: owner }),
    });
    expect((await getPackingList(owner, communityId, list.id)).items[0].delivered).toBe(false);
  });

  it("preserva histórico de membro removido e permite redistribuir", async () => {
    const list = await createList();
    const item = await createPackingItem(
      creator,
      communityId,
      list.id,
      itemInput({ responsibleUserId: member, responsibleLabel: "Casal" }),
    );
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId: member } },
    });
    try {
      expect((await getPackingList(owner, communityId, list.id)).items[0]).toMatchObject({
        responsibleName: "member",
        responsibleIsMember: false,
        responsibleLabel: "Casal",
      });
      await expect(getPackingList(member, communityId, list.id)).rejects.toMatchObject({
        status: 404,
      });
      await changePackingItem(owner, communityId, list.id, item.id, {
        type: "action",
        input: { action: "release" },
      });
    } finally {
      await prisma.communityMember.create({
        data: { communityId, userId: member, displayName: "Kelvin" },
      });
    }
  });

  it("pagina sem duplicação e limita o tamanho das listas", async () => {
    await prisma.packingList.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        communityId,
        createdById: creator,
        title: `Lista ${index}`,
      })),
    });
    const first = await listPackingLists(member, communityId);
    const second = await listPackingLists(member, communityId, 2);
    expect(first.lists).toHaveLength(20);
    expect(second.lists).toHaveLength(1);
    expect(new Set([...first.lists, ...second.lists].map((list) => list.id)).size).toBe(21);
    const listId = first.lists[0].id;
    await prisma.packingItem.createMany({
      data: Array.from({ length: 300 }, () => ({ listId, createdById: creator, name: "Item" })),
    });
    await expect(
      createPackingItem(creator, communityId, listId, itemInput()),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("coordena fechamento concorrente com reserva de item", async () => {
    const list = await createList();
    const item = await createPackingItem(creator, communityId, list.id, itemInput());
    const [closed, claimed] = await Promise.allSettled([
      setPackingListClosed(creator, communityId, list.id, true),
      changePackingItem(member, communityId, list.id, item.id, {
        type: "action",
        input: { action: "claim", responsibleLabel: null },
      }),
    ]);
    expect(closed.status).toBe("fulfilled");
    const detail = await getPackingList(owner, communityId, list.id);
    expect(detail.closed).toBe(true);
    expect(detail.items[0].responsibleUserId).toBe(claimed.status === "fulfilled" ? member : null);
    if (claimed.status === "rejected")
      expect(claimed.reason).toMatchObject({ code: "LIST_CLOSED" });
  });

  it("preserva listas se o evento for excluído e permite administração por ADMIN", async () => {
    const event = await prisma.event.create({
      data: {
        communityId,
        createdById: owner,
        title: "Evento temporário",
        startsAt: new Date("2027-02-01T12:00:00Z"),
      },
    });
    const list = await createPackingList(creator, communityId, listInput({ eventId: event.id }));
    await prisma.event.delete({ where: { id: event.id } });
    expect((await getPackingList(member, communityId, list.id)).event).toBeNull();
    await prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId: member } },
      data: { role: "ADMIN" },
    });
    try {
      await updatePackingList(
        member,
        communityId,
        list.id,
        listInput({ title: "Lista administrada" }),
      );
      await setPackingListClosed(member, communityId, list.id, true);
      expect((await getPackingList(member, communityId, list.id)).closed).toBe(true);
    } finally {
      await prisma.communityMember.update({
        where: { communityId_userId: { communityId, userId: member } },
        data: { role: "MEMBER" },
      });
    }
  });

  it("valida JSON, identificadores, origem e permissões também pela API", async () => {
    const context = { params: Promise.resolve({ communityId }) };
    const url = `http://localhost/api/communities/${communityId}/packing-lists`;
    expect((await postList(new Request(url, { method: "POST", body: "{" }), context)).status).toBe(
      400,
    );
    expect(
      (
        await postList(
          new Request(url, { method: "POST", body: JSON.stringify({ title: " " }) }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await postList(
          new Request(url, {
            method: "POST",
            headers: { origin: "https://evil.example" },
            body: JSON.stringify(listInput()),
          }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await postList(new Request(url, { method: "POST", body: JSON.stringify(listInput()) }), {
          params: Promise.resolve({ communityId: "bad" }),
        })
      ).status,
    ).toBe(400);
    const response = await postList(
      new Request(url, { method: "POST", body: JSON.stringify(listInput()) }),
      context,
    );
    expect(response.status).toBe(201);
    const { list } = (await response.json()) as { list: { id: string } };
    const item = await createPackingItem(
      creator,
      communityId,
      list.id,
      itemInput({ responsibleUserId: creator }),
    );
    session.userId = member;
    const itemResponse = await patchItem(
      new Request(`${url}/${list.id}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "release" }),
      }),
      { params: Promise.resolve({ communityId, listId: list.id, itemId: item.id }) },
    );
    expect(itemResponse.status).toBe(403);
  });
});
