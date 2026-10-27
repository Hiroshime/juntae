import { hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { addPollOptionSchema, createPollSchema } from "@/lib/validation/poll";
import {
  addPollOptionImages,
  addPollOption,
  castVote,
  closePoll,
  createPoll,
  deletePollOptionImage,
  getPoll,
  getPollOptionImage,
  listPolls,
  removeVote,
  reopenPoll,
  updatePoll,
} from "@/server/services/poll-service";

describe("poll services", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ownerId = "";
  let adminId = "";
  let memberId = "";
  let outsiderId = "";
  let communityId = "";

  const simpleInput = {
    title: "Onde vamos?",
    description: null,
    type: "SINGLE_CHOICE" as const,
    allowVoteChange: true,
    closesAt: null,
    options: ["Parque", "Cinema", "Restaurante"].map((label) => ({
      label,
      description: null,
      imageUrl: null,
      websiteUrl: null,
      location: null,
    })),
  };
  const groupedInput = (allowVoteChange = true) =>
    createPollSchema.parse({
      title: "Refeições",
      description: "",
      type: "GROUPED",
      allowVoteChange,
      allowMemberOptions: true,
      closesAt: null,
      questions: [
        { title: "Almoço", type: "SINGLE_CHOICE", options: ["Churrasco", "Macarrão"] },
        { title: "Jantar", type: "MULTIPLE_CHOICE", options: ["Pizza", "Cachorro-quente"] },
      ],
    });
  const newOption = (label: string, questionId?: string) =>
    addPollOptionSchema.parse({ label, questionId });

  beforeAll(async () => {
    const passwordHash = await hash("senha-de-teste", 4);
    const [owner, admin, member, outsider] = await Promise.all(
      ["owner", "admin", "member", "outsider"].map((kind) =>
        prisma.user.create({
          data: {
            email: `poll-${kind}-${suffix}@test.local`,
            name: `Poll ${kind}`,
            passwordHash,
          },
        }),
      ),
    );
    ownerId = owner.id;
    adminId = admin.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const community = await prisma.community.create({
      data: {
        name: `Polls ${suffix}`,
        slug: `polls-${suffix}`,
        createdById: ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: adminId, role: "ADMIN" },
            { userId: memberId, role: "MEMBER", displayName: "Nome na votação" },
          ],
        },
      },
    });
    communityId = community.id;
  });

  beforeEach(async () => {
    await prisma.poll.deleteMany({ where: { communityId } });
    await prisma.availabilityOverride.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, memberId, outsiderId] } },
    });
  });

  it("permite que qualquer membro crie e liste os três tipos", async () => {
    await createPoll(memberId, communityId, simpleInput);
    await createPoll(memberId, communityId, {
      ...simpleInput,
      title: "O que fazer?",
      type: "MULTIPLE_CHOICE",
    });
    await createPoll(memberId, communityId, {
      title: "Quando vamos?",
      description: null,
      type: "DATE_OPTIONS",
      timezone: "America/Sao_Paulo",
      allowVoteChange: true,
      closesAt: null,
      dates: ["2030-09-10", "2030-09-11"],
    });
    const polls = await listPolls(ownerId, communityId, { scope: "OPEN", take: 10 });
    expect(polls).toHaveLength(3);
    expect(new Set(polls.map((poll) => poll.type))).toEqual(
      new Set(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "DATE_OPTIONS"]),
    );
  });

  it("controla sugestões por configuração, preserva votos e não vota automaticamente", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    expect((await getPoll(memberId, communityId, poll.id)).canAddOptions).toBe(false);
    await expect(
      addPollOption(memberId, communityId, poll.id, newOption("Yakisoba")),
    ).rejects.toMatchObject({ status: 403 });
    await castVote(memberId, communityId, poll.id, [poll.options[0].id]);
    await updatePoll(ownerId, communityId, poll.id, { ...simpleInput, allowMemberOptions: true });
    const option = await addPollOption(memberId, communityId, poll.id, newOption("Yakisoba"));
    let detail = await getPoll(memberId, communityId, poll.id);
    expect(detail).toMatchObject({
      canAddOptions: true,
      myOptionIds: [poll.options[0].id],
      totalVoters: 1,
    });
    expect(detail.options.find((item) => item.id === option.id)?.voteCount).toBe(0);
    // An older client must not silently turn off the new setting.
    await updatePoll(adminId, communityId, poll.id, simpleInput);
    expect((await getPoll(memberId, communityId, poll.id)).allowMemberOptions).toBe(true);
    await updatePoll(ownerId, communityId, poll.id, { ...simpleInput, allowMemberOptions: false });
    await expect(
      addPollOption(memberId, communityId, poll.id, newOption("Sushi")),
    ).rejects.toMatchObject({ status: 403 });
    await addPollOption(adminId, communityId, poll.id, newOption("Sushi"));
    detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.options).toHaveLength(5);
    expect(detail.myOptionIds).toEqual([poll.options[0].id]);
    await expect(
      addPollOption(outsiderId, communityId, poll.id, newOption("Externo")),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("preserva votos de perguntas diferentes ao responder, alterar e remover", async () => {
    const poll = await createPoll(memberId, communityId, groupedInput());
    const detail = await getPoll(memberId, communityId, poll.id);
    const [lunch, dinner] = detail.questions;
    const [bbq, pasta] = detail.options.filter((option) => option.questionId === lunch.id);
    const dinnerOptions = detail.options.filter((option) => option.questionId === dinner.id);
    await castVote(memberId, communityId, poll.id, [bbq.id], lunch.id);
    await castVote(
      memberId,
      communityId,
      poll.id,
      dinnerOptions.map((option) => option.id),
      dinner.id,
    );
    await castVote(memberId, communityId, poll.id, [pasta.id], lunch.id);
    expect(new Set((await getPoll(memberId, communityId, poll.id)).myOptionIds)).toEqual(
      new Set([pasta.id, ...dinnerOptions.map((option) => option.id)]),
    );
    await removeVote(memberId, communityId, poll.id, lunch.id);
    expect((await getPoll(memberId, communityId, poll.id)).myOptionIds).toHaveLength(2);
  });

  it("bloqueia mudança por pergunta e permite responder às demais", async () => {
    const poll = await createPoll(ownerId, communityId, groupedInput(false));
    let detail = await getPoll(memberId, communityId, poll.id);
    const [lunch, dinner] = detail.questions;
    const lunchIds = detail.options
      .filter((option) => option.questionId === lunch.id)
      .map((option) => option.id);
    const dinnerId = detail.options.find((option) => option.questionId === dinner.id)!.id;
    await castVote(memberId, communityId, poll.id, [lunchIds[0]], lunch.id);
    detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.questions.map((question) => question.canVote)).toEqual([false, true]);
    await expect(
      castVote(memberId, communityId, poll.id, [lunchIds[0]], lunch.id),
    ).resolves.toEqual({ optionIds: [lunchIds[0]] });
    await expect(
      castVote(memberId, communityId, poll.id, [lunchIds[1]], lunch.id),
    ).rejects.toMatchObject({ code: "VOTE_CHANGE_NOT_ALLOWED" });
    await expect(removeVote(memberId, communityId, poll.id, lunch.id)).rejects.toMatchObject({
      code: "VOTE_CHANGE_NOT_ALLOWED",
    });
    await castVote(memberId, communityId, poll.id, [dinnerId], dinner.id);
    expect(
      (await getPoll(memberId, communityId, poll.id)).questions.every(
        (question) => !question.canVote,
      ),
    ).toBe(true);
  });

  it("calcula denominadores por pergunta e conta pessoas distintas no total", async () => {
    const poll = await createPoll(ownerId, communityId, groupedInput());
    let detail = await getPoll(memberId, communityId, poll.id);
    const [lunch, dinner] = detail.questions;
    const lunchIds = detail.options
      .filter((option) => option.questionId === lunch.id)
      .map((option) => option.id);
    const dinnerId = detail.options.find((option) => option.questionId === dinner.id)!.id;
    await castVote(memberId, communityId, poll.id, [lunchIds[0]], lunch.id);
    await castVote(adminId, communityId, poll.id, [lunchIds[1]], lunch.id);
    await castVote(memberId, communityId, poll.id, [dinnerId], dinner.id);
    detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.totalVoters).toBe(2);
    expect(detail.questions.map((question) => question.totalVoters)).toEqual([2, 1]);
    expect(detail.options.map((option) => option.percentage)).toEqual([50, 50, 100, 0]);
    expect((await listPolls(memberId, communityId, { scope: "OPEN", take: 10 }))[0]).toMatchObject({
      questionCount: 2,
      leadingOption: null,
      totalVoters: 2,
    });
  });

  it("rejeita votos misturados, múltiplos em pergunta única e perguntas alheias ou ausentes", async () => {
    const poll = await createPoll(ownerId, communityId, groupedInput());
    const other = await createPoll(ownerId, communityId, groupedInput());
    const detail = await getPoll(memberId, communityId, poll.id);
    const foreignQuestion = (await getPoll(memberId, communityId, other.id)).questions[0].id;
    const lunch = detail.questions[0].id;
    await expect(
      castVote(memberId, communityId, poll.id, [detail.options[0].id, detail.options[1].id], lunch),
    ).rejects.toMatchObject({ code: "INVALID_VOTE_SELECTION" });
    await expect(
      castVote(memberId, communityId, poll.id, [detail.options[2].id], lunch),
    ).rejects.toMatchObject({ code: "INVALID_OPTION" });
    await expect(
      castVote(memberId, communityId, poll.id, [detail.options[0].id]),
    ).rejects.toMatchObject({ code: "INVALID_QUESTION" });
    await expect(removeVote(memberId, communityId, poll.id)).rejects.toMatchObject({
      code: "INVALID_QUESTION",
    });
    await expect(
      addPollOption(memberId, communityId, poll.id, newOption("Arroz", foreignQuestion)),
    ).rejects.toMatchObject({ code: "INVALID_QUESTION" });
    await expect(
      castVote(outsiderId, communityId, poll.id, [detail.options[0].id], lunch),
    ).rejects.toMatchObject({ status: 404 });
    const flat = await createPoll(ownerId, communityId, simpleInput);
    await expect(
      castVote(memberId, communityId, flat.id, [flat.options[0].id], lunch),
    ).rejects.toMatchObject({ code: "INVALID_QUESTION" });
  });

  it("adiciona alternativas dentro da pergunta correta, rejeita repetidas e aceita repetir entre perguntas", async () => {
    const poll = await createPoll(ownerId, communityId, groupedInput());
    const [lunch, dinner] = (await getPoll(memberId, communityId, poll.id)).questions;
    await addPollOption(memberId, communityId, poll.id, newOption("Yakisoba", lunch.id));
    await expect(
      addPollOption(adminId, communityId, poll.id, newOption(" yakisoba ", lunch.id)),
    ).rejects.toMatchObject({ code: "DUPLICATE_OPTION" });
    await addPollOption(memberId, communityId, poll.id, newOption("Yakisoba", dinner.id));
    const detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.options.filter((option) => option.label === "Yakisoba")).toHaveLength(2);
    expect(detail.totalVoters).toBe(0);
  });

  it("serializa duplicação e limite de opções concorrentes", async () => {
    const poll = await createPoll(ownerId, communityId, {
      ...simpleInput,
      allowMemberOptions: true,
    });
    const repeated = await Promise.allSettled(
      [memberId, adminId].map((id) =>
        addPollOption(id, communityId, poll.id, newOption("Yakisoba")),
      ),
    );
    expect(repeated.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await prisma.pollOption.createMany({
      data: Array.from({ length: 15 }, (_, i) => ({
        pollId: poll.id,
        label: `Extra ${i}`,
        sortOrder: i + 4,
      })),
    });
    const limited = await Promise.allSettled(
      ["Arroz", "Feijão"].map((label) =>
        addPollOption(memberId, communityId, poll.id, newOption(label)),
      ),
    );
    expect(limited.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await getPoll(memberId, communityId, poll.id)).options).toHaveLength(20);
  });

  it("coordena sugestões com desativação e encerramento concorrentes", async () => {
    const poll = await createPoll(ownerId, communityId, {
      ...simpleInput,
      allowMemberOptions: true,
    });
    const [disabled, suggested] = await Promise.allSettled([
      updatePoll(ownerId, communityId, poll.id, { ...simpleInput, allowMemberOptions: false }),
      addPollOption(memberId, communityId, poll.id, newOption("Yakisoba")),
    ]);
    expect(disabled.status).toBe("fulfilled");
    if (suggested.status === "rejected") expect(suggested.reason).toMatchObject({ status: 403 });
    expect((await getPoll(memberId, communityId, poll.id)).allowMemberOptions).toBe(false);
    await expect(
      addPollOption(memberId, communityId, poll.id, newOption("Arroz")),
    ).rejects.toMatchObject({ status: 403 });
    const [closed, added] = await Promise.allSettled([
      closePoll(ownerId, communityId, poll.id),
      addPollOption(adminId, communityId, poll.id, newOption("Sushi")),
    ]);
    expect(closed.status).toBe("fulfilled");
    if (added.status === "rejected") expect(added.reason).toMatchObject({ code: "POLL_CLOSED" });
    expect((await getPoll(memberId, communityId, poll.id)).status).toBe("CLOSED");
    await expect(
      addPollOption(adminId, communityId, poll.id, newOption("Arroz")),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });
  });

  it("preserva agrupamento, votos e álbum ao encerrar/reabrir e bloqueia novas sugestões fechadas", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const poll = await createPoll(ownerId, communityId, groupedInput(), [
      {
        optionIndex: 2,
        data: bytes,
        contentType: "image/png",
        originalName: "pizza.png",
        sizeBytes: bytes.length,
        sortOrder: 0,
      },
    ]);
    let detail = await getPoll(memberId, communityId, poll.id);
    const questionId = detail.questions[1].id;
    await castVote(memberId, communityId, poll.id, [detail.options[2].id], questionId);
    await closePoll(ownerId, communityId, poll.id);
    await expect(
      addPollOption(memberId, communityId, poll.id, newOption("Yakisoba", questionId)),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });
    await expect(
      addPollOption(adminId, communityId, poll.id, newOption("Yakisoba", questionId)),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });
    await reopenPoll(ownerId, communityId, poll.id, { durationDays: 2 });
    detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.questions).toHaveLength(2);
    expect(detail.options[2]).toMatchObject({
      voteCount: 1,
      images: [{ originalName: "pizza.png" }],
    });
    expect(detail.myOptionIds).toEqual([detail.options[2].id]);
  });

  it("valida datas sugeridas e bloqueia adições após prazo", async () => {
    const poll = await createPoll(
      ownerId,
      communityId,
      createPollSchema.parse({
        ...simpleInput,
        type: "DATE_OPTIONS",
        dates: ["2030-09-10", "2030-09-11"],
        allowMemberOptions: true,
        timezone: "America/Sao_Paulo",
      }),
    );
    await addPollOption(
      memberId,
      communityId,
      poll.id,
      addPollOptionSchema.parse({ label: "Data", dateValue: "2030-09-12" }),
    );
    await expect(
      addPollOption(
        memberId,
        communityId,
        poll.id,
        addPollOptionSchema.parse({ label: "Data", dateValue: "2030-09-12" }),
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_OPTION" });
    await expect(
      addPollOption(
        memberId,
        communityId,
        poll.id,
        addPollOptionSchema.parse({ label: "Data", dateValue: "2032-09-12" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_OPTION_DATE" });
    await prisma.poll.update({
      where: { id: poll.id },
      data: { createdAt: new Date(Date.now() - 2000), closesAt: new Date(Date.now() - 1000) },
    });
    await expect(
      addPollOption(memberId, communityId, poll.id, newOption("Teste")),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });
  });

  it("substitui atomicamente o voto de escolha única", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await castVote(memberId, communityId, poll.id, [poll.options[0].id]);
    await castVote(memberId, communityId, poll.id, [poll.options[1].id]);
    const detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.myOptionIds).toEqual([poll.options[1].id]);
    expect(detail.totalVoters).toBe(1);
    expect(await prisma.pollVote.count({ where: { pollId: poll.id, userId: memberId } })).toBe(1);
  });

  it("persiste múltiplas opções e permite remover o voto", async () => {
    const poll = await createPoll(ownerId, communityId, {
      ...simpleInput,
      type: "MULTIPLE_CHOICE",
    });
    await castVote(memberId, communityId, poll.id, [poll.options[0].id, poll.options[2].id]);
    expect((await getPoll(memberId, communityId, poll.id)).myOptionIds).toHaveLength(2);
    await removeVote(memberId, communityId, poll.id);
    expect((await getPoll(memberId, communityId, poll.id)).myOptionIds).toEqual([]);
  });

  it("impede alteração quando configurado, mas mantém reenvio idempotente", async () => {
    const poll = await createPoll(ownerId, communityId, {
      ...simpleInput,
      allowVoteChange: false,
    });
    await castVote(memberId, communityId, poll.id, [poll.options[0].id]);
    await expect(castVote(memberId, communityId, poll.id, [poll.options[0].id])).resolves.toEqual({
      optionIds: [poll.options[0].id],
    });
    await expect(
      castVote(memberId, communityId, poll.id, [poll.options[1].id]),
    ).rejects.toMatchObject({ code: "VOTE_CHANGE_NOT_ALLOWED" });
    await expect(removeVote(memberId, communityId, poll.id)).rejects.toMatchObject({
      code: "VOTE_CHANGE_NOT_ALLOWED",
    });
  });

  it("não aceita voto encerrado por status ou prazo", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await closePoll(ownerId, communityId, poll.id);
    await expect(
      castVote(memberId, communityId, poll.id, [poll.options[0].id]),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });

    const expired = await createPoll(ownerId, communityId, {
      ...simpleInput,
      title: "Prazo expirado",
    });
    await prisma.poll.update({
      where: { id: expired.id },
      data: { closesAt: new Date(Date.now() + 1_000) },
    });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await expect(
      castVote(memberId, communityId, expired.id, [expired.options[0].id]),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });
  });

  it("reabre votação recente por até 15 dias e preserva os votos", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await castVote(memberId, communityId, poll.id, [poll.options[0].id]);
    await closePoll(ownerId, communityId, poll.id);
    const closed = await getPoll(ownerId, communityId, poll.id);
    expect(closed).toMatchObject({ status: "CLOSED", canReopen: true, totalVoters: 1 });

    const reopenedAt = new Date();
    const reopened = await reopenPoll(
      adminId,
      communityId,
      poll.id,
      { durationDays: 5 },
      reopenedAt,
    );
    expect(reopened.status).toBe("OPEN");
    expect(reopened.closedAt).toBeNull();
    expect(reopened.closesAt).toEqual(new Date(reopenedAt.getTime() + 5 * 24 * 60 * 60 * 1_000));

    const detail = await getPoll(memberId, communityId, poll.id);
    expect(detail).toMatchObject({ status: "OPEN", totalVoters: 1, canVote: true });
    await expect(castVote(memberId, communityId, poll.id, [poll.options[1].id])).resolves.toEqual({
      optionIds: [poll.options[1].id],
    });
  });

  it("restringe reabertura por autoria, duração e janela após o encerramento", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await closePoll(ownerId, communityId, poll.id);
    await expect(
      reopenPoll(memberId, communityId, poll.id, { durationDays: 3 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      reopenPoll(ownerId, communityId, poll.id, { durationDays: 16 } as { durationDays: number }),
    ).rejects.toMatchObject({ code: "INVALID_POLL_REOPEN_DURATION" });

    const now = new Date();
    await prisma.poll.update({
      where: { id: poll.id },
      data: {
        createdAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1_000),
        closedAt: new Date(now.getTime() - 16 * 24 * 60 * 60 * 1_000),
      },
    });
    await expect(
      reopenPoll(ownerId, communityId, poll.id, { durationDays: 3 }, now),
    ).rejects.toMatchObject({ code: "POLL_REOPEN_WINDOW_EXPIRED" });
    expect((await getPoll(ownerId, communityId, poll.id)).canReopen).toBe(false);
  });

  it("protege acesso e moderação por membership e papel", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await expect(getPoll(outsiderId, communityId, poll.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      updatePoll(memberId, communityId, poll.id, {
        title: "Sem permissão",
        description: null,
        allowVoteChange: true,
        closesAt: null,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updatePoll(adminId, communityId, poll.id, {
        title: "Moderada pelo admin",
        description: null,
        allowVoteChange: true,
        closesAt: null,
      }),
    ).resolves.toMatchObject({ title: "Moderada pelo admin" });
  });

  it("exibe votos e disponibilidade separadamente em opções de data", async () => {
    await prisma.availabilityOverride.create({
      data: {
        communityId,
        userId: memberId,
        startAt: new Date("2030-09-10T03:00:00.000Z"),
        endAt: new Date("2030-09-11T03:00:00.000Z"),
        allDay: true,
        status: "AVAILABLE",
      },
    });
    const poll = await createPoll(ownerId, communityId, {
      title: "Melhor data",
      description: null,
      type: "DATE_OPTIONS",
      timezone: "America/Sao_Paulo",
      allowVoteChange: true,
      closesAt: null,
      dates: ["2030-09-10", "2030-09-11"],
    });
    await castVote(memberId, communityId, poll.id, [poll.options[0].id, poll.options[1].id]);
    const detail = await getPoll(ownerId, communityId, poll.id);
    expect(detail.options[0]).toMatchObject({
      voteCount: 1,
      availability: { fullAvailableCount: 1, unknownCount: 2, score: 1 },
    });
    expect(detail.options[0].voters[0].name).toBe("Nome na votação");
  });

  it("persiste e retorna os detalhes opcionais dos cards de votação", async () => {
    const poll = await createPoll(ownerId, communityId, {
      ...simpleInput,
      options: [
        {
          label: "Chácara Recanto Verde",
          description: "Piscina, churrasqueira e quatro quartos.",
          imageUrl: "https://images.example.com/recanto.jpg",
          websiteUrl: "https://example.com/recanto",
          location: "Atibaia, SP",
        },
        simpleInput.options[1],
      ],
    });
    const detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.options[0]).toMatchObject({
      label: "Chácara Recanto Verde",
      description: "Piscina, churrasqueira e quatro quartos.",
      imageUrl: "https://images.example.com/recanto.jpg",
      websiteUrl: "https://example.com/recanto",
      location: "Atibaia, SP",
    });
    expect(detail.options[1]).toMatchObject({ description: null, imageUrl: null });
  });

  it("persiste álbuns atomicamente e protege os bytes por comunidade", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const poll = await createPoll(ownerId, communityId, simpleInput, [
      {
        optionIndex: 0,
        data: bytes,
        contentType: "image/png",
        originalName: "recanto.png",
        sizeBytes: bytes.byteLength,
        sortOrder: 0,
      },
      {
        optionIndex: 0,
        data: bytes,
        contentType: "image/png",
        originalName: "piscina.png",
        sizeBytes: bytes.byteLength,
        sortOrder: 1,
      },
    ]);
    const detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.options[0].images).toHaveLength(2);
    const imageId = detail.options[0].images[0].id;
    await expect(
      getPollOptionImage(memberId, communityId, poll.id, poll.options[0].id, imageId),
    ).resolves.toMatchObject({ contentType: "image/png", originalName: "recanto.png" });
    await expect(
      getPollOptionImage(outsiderId, communityId, poll.id, poll.options[0].id, imageId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("permite gerenciar fotos depois da criação sem alterar as opções", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
    const upload = (originalName: string) => ({
      optionIndex: 0,
      data: bytes,
      contentType: "image/png" as const,
      originalName,
      sizeBytes: bytes.byteLength,
      sortOrder: 0,
    });
    const poll = await createPoll(ownerId, communityId, simpleInput);
    const [first] = await addPollOptionImages(ownerId, communityId, poll.id, poll.options[0].id, [
      upload("fachada.png"),
      upload("piscina.png"),
    ]);
    await addPollOptionImages(adminId, communityId, poll.id, poll.options[0].id, [
      upload("quartos.png"),
    ]);

    const detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.options[0].images).toMatchObject([
      { originalName: "fachada.png", sizeBytes: bytes.byteLength },
      { originalName: "piscina.png", sizeBytes: bytes.byteLength },
      { originalName: "quartos.png", sizeBytes: bytes.byteLength },
    ]);
    expect(detail.options[0].label).toBe(simpleInput.options[0].label);

    await deletePollOptionImage(ownerId, communityId, poll.id, poll.options[0].id, first.id);
    expect((await getPoll(ownerId, communityId, poll.id)).options[0].images).toHaveLength(2);
  });

  it("protege a edição de álbuns por autoria, estado e limite", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
    const upload = (index: number) => ({
      optionIndex: 0,
      data: bytes,
      contentType: "image/jpeg" as const,
      originalName: `foto-${index}.jpg`,
      sizeBytes: bytes.byteLength,
      sortOrder: index,
    });
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await expect(
      addPollOptionImages(memberId, communityId, poll.id, poll.options[0].id, [upload(0)]),
    ).rejects.toMatchObject({ status: 403 });

    await addPollOptionImages(
      ownerId,
      communityId,
      poll.id,
      poll.options[0].id,
      Array.from({ length: 6 }, (_, index) => upload(index)),
    );
    await expect(
      addPollOptionImages(ownerId, communityId, poll.id, poll.options[0].id, [upload(6)]),
    ).rejects.toMatchObject({ code: "TOO_MANY_POLL_IMAGES" });

    await closePoll(ownerId, communityId, poll.id);
    const imageId = (await getPoll(ownerId, communityId, poll.id)).options[0].images[0].id;
    await expect(
      deletePollOptionImage(ownerId, communityId, poll.id, poll.options[0].id, imageId),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });
  });
});
