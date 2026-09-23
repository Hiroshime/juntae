import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { bellHopPlatform } from "../../src/lib/games/bell-hop";
import { towerBlockSpec } from "../../src/lib/games/tower-stack";

async function login(page: Page, email: string, password: string) {
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `e2e-games-${randomUUID()}`,
  });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/login",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page).toHaveURL(/\/app/);
}

test("jogos: duas pessoas entram, ficam prontas e concluem uma partida no mobile", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const password = "senha-games-e2e";
  const passwordHash = await hash(password, 4);
  const [owner, member] = await Promise.all([
    db.user.create({
      data: { name: "Jogadora X", email: `game-x-${suffix}@test.local`, passwordHash },
    }),
    db.user.create({
      data: { name: "Jogador O", email: `game-o-${suffix}@test.local`, passwordHash },
    }),
  ]);
  let communityId: string | undefined;
  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  try {
    const community = await db.community.create({
      data: {
        name: "Turma dos jogos",
        slug: `games-e2e-${suffix}`,
        createdById: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
      },
    });
    communityId = community.id;
    const gamesPath = `/app/${community.slug}/games`;
    await login(ownerPage, owner.email, password);
    await ownerPage.goto(gamesPath);
    await expect(
      ownerPage.getByRole("heading", { name: "Uma pausa para jogar junto" }),
    ).toBeVisible();
    expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page: ownerPage }).analyze()).violations).toEqual([]);
    const ticTacToeCard = ownerPage
      .locator(".game-catalog-card")
      .filter({ has: ownerPage.getByRole("heading", { name: "Jogo da velha" }) });
    await ticTacToeCard.getByLabel("Nome da sala").fill("Final da amizade");
    await ticTacToeCard.getByRole("button", { name: "Criar sala" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`${gamesPath}/[a-f0-9-]{36}$`));
    const roomUrl = ownerPage.url();
    const roomId = roomUrl.split("/").at(-1);
    if (!roomId) throw new Error("Sala criada sem identificador.");

    await login(memberPage, member.email, password);
    await memberPage.goto(roomUrl);
    await expect(memberPage.getByRole("button", { name: "Entrar na sala" })).toHaveCount(0);
    const players = memberPage.locator(".game-player-list");
    await expect(players.getByText("Jogadora X", { exact: true })).toBeVisible();
    await expect(players.getByText("Jogador O", { exact: true })).toBeVisible({ timeout: 4_000 });
    await expect(players.getByText("Anfitrião da sala", { exact: true })).toBeVisible();
    await expect(players.getByText("Aguardando", { exact: true })).toHaveCount(2);
    await ownerPage.getByRole("button", { name: "Estou pronto" }).click();
    await expect(
      memberPage.locator(".room-lobby-list").getByText("Pronto", { exact: true }),
    ).toHaveCount(1, { timeout: 4_000 });
    await memberPage.getByRole("button", { name: "Estou pronto" }).click();
    await expect(ownerPage.getByText("Sua vez — você joga com X")).toBeVisible({ timeout: 4_000 });

    await ownerPage.getByRole("button", { name: "Linha 1, coluna 1, vazia" }).click();
    await expect(memberPage.getByText("Sua vez — você joga com O")).toBeVisible({ timeout: 4_000 });
    await memberPage.getByRole("button", { name: "Linha 2, coluna 1, vazia" }).click();
    await expect(ownerPage.getByText("Sua vez — você joga com X")).toBeVisible({ timeout: 4_000 });
    await ownerPage.getByRole("button", { name: "Linha 1, coluna 2, vazia" }).click();
    await expect(memberPage.getByText("Sua vez — você joga com O")).toBeVisible({ timeout: 4_000 });
    await memberPage.getByRole("button", { name: "Linha 2, coluna 2, vazia" }).click();
    await expect(ownerPage.getByText("Sua vez — você joga com X")).toBeVisible({ timeout: 4_000 });
    await ownerPage.getByRole("button", { name: "Linha 1, coluna 3, vazia" }).click();

    await expect(ownerPage.getByText("Jogadora X venceu!", { exact: true })).toBeVisible();
    await expect(memberPage.getByText("Jogadora X venceu!", { exact: true })).toBeVisible({
      timeout: 4_000,
    });
    await expect(ownerPage.getByRole("button", { name: "Estou pronto" })).toBeVisible();
    expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page: ownerPage }).analyze()).violations).toEqual([]);
    expect(
      await db.gameMatch.count({
        where: { communityId: community.id, status: "FINISHED", winnerId: owner.id },
      }),
    ).toBe(1);
    await ownerPage.getByRole("link", { name: "Voltar aos jogos" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`${gamesPath}$`));
    await expect
      .poll(
        () =>
          db.gameRoomPlayer.count({
            where: { roomId, userId: owner.id },
          }),
        { timeout: 4_000 },
      )
      .toBe(0);
    await expect(ownerPage.locator(".game-room-card")).toHaveCount(1);
    await memberPage.getByRole("button", { name: "Sair da sala", exact: true }).click();
    await expect(memberPage).toHaveURL(new RegExp(`${gamesPath}$`));
    await expect(memberPage.locator(".game-room-card")).toHaveCount(0);
    await expect(ownerPage.locator(".game-room-card")).toHaveCount(0, { timeout: 8_000 });
  } finally {
    await ownerContext.close();
    await memberContext.close();
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, member.id] } } });
    await db.$disconnect();
  }
});

test("forca: sorteia o mestre, protege a palavra e encerra o placar no mobile", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const password = "senha-forca-e2e";
  const passwordHash = await hash(password, 4);
  const [owner, member] = await Promise.all([
    db.user.create({
      data: { name: "Ana Forca", email: `hangman-a-${suffix}@test.local`, passwordHash },
    }),
    db.user.create({
      data: { name: "Beto Forca", email: `hangman-b-${suffix}@test.local`, passwordHash },
    }),
  ]);
  let communityId: string | undefined;
  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  try {
    const community = await db.community.create({
      data: {
        name: "Turma da forca",
        slug: `hangman-e2e-${suffix}`,
        createdById: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
      },
    });
    communityId = community.id;
    const gamesPath = `/app/${community.slug}/games`;
    await login(ownerPage, owner.email, password);
    await ownerPage.goto(gamesPath);
    await ownerPage.setViewportSize({ width: 1280, height: 900 });
    await expect(
      ownerPage
        .getByRole("navigation", { name: "Navegação da comunidade" })
        .getByRole("link", { name: "Jogos", exact: true }),
    ).toBeInViewport();
    const desktopHangmanCard = ownerPage
      .locator(".game-catalog-card")
      .filter({ has: ownerPage.getByRole("heading", { name: "Jogo da forca" }) });
    await desktopHangmanCard.scrollIntoViewIfNeeded();
    await expect(desktopHangmanCard).toBeInViewport();
    expect(
      await desktopHangmanCard.evaluate(
        (card) =>
          card.scrollWidth <= card.clientWidth &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(desktopHangmanCard.getByLabel("Nome da sala")).toBeInViewport();
    await expect(desktopHangmanCard.getByRole("button", { name: "Criar sala" })).toBeInViewport();
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    const hangmanCard = ownerPage
      .locator(".game-catalog-card")
      .filter({ has: ownerPage.getByRole("heading", { name: "Jogo da forca" }) });
    await hangmanCard.getByLabel("Nome da sala").fill("Palavra secreta");
    await hangmanCard.getByLabel("Palavras na partida").fill("1");
    await hangmanCard.getByRole("button", { name: "Criar sala" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`${gamesPath}/[a-f0-9-]{36}$`));
    const roomUrl = ownerPage.url();

    await login(memberPage, member.email, password);
    await memberPage.goto(roomUrl);
    await expect(
      memberPage.locator(".room-lobby-list").getByText("Beto Forca", { exact: true }),
    ).toBeVisible({ timeout: 4_000 });
    await ownerPage.getByRole("button", { name: "Estou pronto" }).click();
    await memberPage.getByRole("button", { name: "Estou pronto" }).click();

    await expect
      .poll(
        () =>
          db.hangmanSession.findFirst({
            where: { communityId: community.id, status: "ACTIVE" },
            include: { rounds: { orderBy: { roundNumber: "desc" }, take: 1 } },
          }),
        { timeout: 5_000 },
      )
      .not.toBeNull();
    const active = await db.hangmanSession.findFirstOrThrow({
      where: { communityId: community.id, status: "ACTIVE" },
      include: { rounds: { orderBy: { roundNumber: "desc" }, take: 1 } },
    });
    const setterPage = active.rounds[0].setterId === owner.id ? ownerPage : memberPage;
    const guesserPage = active.rounds[0].setterId === owner.id ? memberPage : ownerPage;
    await expect(setterPage.getByText("Você é o mestre desta rodada")).toBeVisible({
      timeout: 4_000,
    });
    await expect(guesserPage.getByLabel("Palavra ou expressão secreta")).toHaveCount(0);
    await setterPage.getByLabel("Palavra ou expressão secreta").fill("Abacaxi");
    await setterPage.getByLabel("Dica opcional").fill("Fruta");
    await setterPage.getByRole("button", { name: "Começar rodada" }).click();

    await expect(guesserPage.getByRole("button", { name: "Palavra inteira" })).toBeVisible({
      timeout: 4_000,
    });
    await guesserPage.getByRole("button", { name: "Palavra inteira" }).click();
    await guesserPage.getByLabel("Digite seu palpite").fill("abacaxi");
    await guesserPage.getByRole("button", { name: "Confirmar palpite" }).click();

    await expect(guesserPage.getByText(/venceu!/)).toBeVisible();
    await expect(setterPage.getByText(/venceu!/)).toBeVisible({ timeout: 4_000 });
    await expect(guesserPage.getByText("A palavra era “Abacaxi”.")).toBeVisible();
    expect(
      await guesserPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page: guesserPage }).analyze()).violations).toEqual([]);
    expect(
      await db.hangmanSession.count({
        where: { communityId: community.id, status: "FINISHED" },
      }),
    ).toBe(1);
  } finally {
    await ownerContext.close();
    await memberContext.close();
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, member.id] } } });
    await db.$disconnect();
  }
});

test("Stop da Turma: cria sala, oculta respostas e revisa por votação no mobile", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const password = "senha-stop-e2e";
  const passwordHash = await hash(password, 4);
  const [owner, member] = await Promise.all([
    db.user.create({
      data: { name: "Ana Stop", email: `stop-a-${suffix}@test.local`, passwordHash },
    }),
    db.user.create({
      data: { name: "Beto Stop", email: `stop-b-${suffix}@test.local`, passwordHash },
    }),
  ]);
  let communityId: string | undefined;
  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  try {
    const community = await db.community.create({
      data: {
        name: "Turma do Stop",
        slug: `stop-e2e-${suffix}`,
        createdById: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
      },
    });
    communityId = community.id;
    const gamesPath = `/app/${community.slug}/games`;
    await login(ownerPage, owner.email, password);
    await ownerPage.goto(gamesPath);
    const stopCard = ownerPage
      .locator(".stop-catalog-card")
      .filter({ has: ownerPage.getByRole("heading", { name: "Stop da Turma" }) });
    await stopCard.scrollIntoViewIfNeeded();
    await stopCard.getByLabel("Nome da sala").fill("Stop de sábado");
    await stopCard.getByRole("button", { name: "Criar sala" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`${gamesPath}/[a-f0-9-]{36}$`));
    const roomUrl = ownerPage.url();
    const rulesEditor = ownerPage.locator(".stop-rule-editor");
    await rulesEditor.getByLabel("Máximo de jogadores").selectOption("2");
    await rulesEditor.getByLabel("Rodadas").selectOption("4");
    await rulesEditor.getByLabel("Tempo").selectOption("30");
    await rulesEditor.getByRole("button", { name: "Salvar regras" }).click();
    await expect(ownerPage.getByText("4 rodadas.", { exact: true })).toBeVisible();

    await login(memberPage, member.email, password);
    await memberPage.goto(roomUrl);
    await expect(
      memberPage.locator(".room-lobby-list").getByText("Beto Stop", { exact: false }),
    ).toBeVisible({ timeout: 4_000 });
    await ownerPage.getByRole("button", { name: "Estou pronto" }).click();
    await memberPage.getByRole("button", { name: "Estou pronto" }).click();
    await expect(ownerPage.locator(".stop-answer-stage")).toBeVisible({ timeout: 4_000 });
    await expect(memberPage.locator(".stop-answer-stage")).toBeVisible({ timeout: 4_000 });

    const letter = (await ownerPage.locator(".stop-letter").textContent())?.trim();
    if (!letter) throw new Error("Letra da rodada não encontrada.");
    await ownerPage.locator(".stop-answer-grid input").first().fill(`${letter}na`);
    await memberPage.locator(".stop-answer-grid input").first().fill(`${letter}manda`);
    await ownerPage.getByRole("button", { name: "STOP!" }).click();

    await expect(ownerPage.getByRole("heading", { name: "Nome" })).toBeVisible({
      timeout: 4_000,
    });
    await expect(memberPage.getByRole("heading", { name: "Nome" })).toBeVisible({
      timeout: 4_000,
    });
    await expect(memberPage.locator(".stop-review-countdown")).toContainText(/(19|20)s/);
    await expect(memberPage.getByText(`${letter}na`, { exact: true })).toBeVisible();
    await memberPage.getByRole("button", { name: "Marcar inválida" }).click();
    await expect(ownerPage.getByText("1/1 inválida", { exact: true })).toBeVisible({
      timeout: 4_000,
    });
    const activeRound = await db.stopRound.findFirstOrThrow({
      where: { session: { communityId: community.id, status: "ACTIVE" } },
      orderBy: { roundNumber: "desc" },
    });
    await db.stopRound.update({
      where: { id: activeRound.id },
      data: { reviewDeadline: new Date(Date.now() - 1_000) },
    });
    await expect(ownerPage.getByRole("heading", { name: "Animal" })).toBeVisible({
      timeout: 4_000,
    });
    await expect(
      ownerPage.locator(".stop-scoreboard").getByText("1 pt", { exact: true }),
    ).toBeVisible();
    expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page: ownerPage }).analyze()).violations).toEqual([]);

    await ownerPage.getByRole("button", { name: "Cancelar partida e sair" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`${gamesPath}$`));
    await expect(memberPage.getByRole("button", { name: "Sair da sala" })).toBeVisible({
      timeout: 4_000,
    });
    await memberPage.getByRole("button", { name: "Sair da sala" }).click();
    await expect(memberPage).toHaveURL(new RegExp(`${gamesPath}$`));
  } finally {
    await ownerContext.close();
    await memberContext.close();
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, member.id] } } });
    await db.$disconnect();
  }
});

test("Salto dos Sinos: controla o coelho, pontua e salva o recorde", async ({ browser }) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const password = "senha-sinos-e2e";
  const passwordHash = await hash(password, 4);
  const user = await db.user.create({
    data: { name: "Coelha Veloz", email: `bell-hop-${suffix}@test.local`, passwordHash },
  });
  let communityId: string | undefined;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    const community = await db.community.create({
      data: {
        name: "Turma do arcade",
        slug: `arcade-e2e-${suffix}`,
        createdById: user.id,
        members: { create: [{ userId: user.id, role: "OWNER" }] },
      },
    });
    communityId = community.id;
    await login(page, user.email, password);
    await page.goto(`/app/${community.slug}/games`);
    const catalogCard = page
      .locator(".arcade-catalog-card")
      .filter({ has: page.getByRole("heading", { name: "Salto dos Sinos" }) });
    await expect(catalogCard).toBeInViewport();
    await catalogCard.getByRole("link", { name: "Jogar agora" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/${community.slug}/games/bell-hop$`));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole("button", { name: "Começar subida" }).click();
    await expect
      .poll(
        () =>
          db.bellHopRun.findFirst({
            where: { communityId: community.id, userId: user.id, status: "ACTIVE" },
          }),
        { timeout: 5_000 },
      )
      .not.toBeNull();
    const active = await db.bellHopRun.findFirstOrThrow({
      where: { communityId: community.id, userId: user.id, status: "ACTIVE" },
    });
    const canvas = page.locator(".bell-hop-canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas do arcade não encontrado.");
    const bellCounter = page.locator(".bell-hop-hud span").nth(1).locator("strong");
    for (let level = 1; level <= 3; level += 1) {
      const bell = bellHopPlatform(active.seed, level);
      await page.mouse.move(box.x + (bell.x / 720) * box.width, box.y + box.height / 2);
      await expect(bellCounter).toHaveText(String(level), { timeout: 5_000 });
    }
    const next = bellHopPlatform(active.seed, 4);
    const missX = next.x > 360 ? 24 : 696;
    await page.mouse.move(box.x + (missX / 720) * box.width, box.y + box.height / 2);
    await expect(page.getByRole("button", { name: "Jogar novamente" })).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText("60 pontos", { exact: true })).toBeVisible();
    await expect(page.getByText(/Recorde salvo no ranking/)).toBeVisible();
    expect(
      await db.bellHopRun.count({
        where: { communityId: community.id, userId: user.id, status: "FINISHED", score: 60 },
      }),
    ).toBe(1);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});

test("Torre em Equilíbrio: perde três vidas e salva o recorde", async ({ browser }) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const password = "senha-torre-e2e";
  const passwordHash = await hash(password, 4);
  const user = await db.user.create({
    data: { name: "Arquiteta E2E", email: `tower-stack-${suffix}@test.local`, passwordHash },
  });
  let communityId: string | undefined;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    const community = await db.community.create({
      data: {
        name: "Turma das torres",
        slug: `tower-stack-e2e-${suffix}`,
        createdById: user.id,
        members: { create: [{ userId: user.id, role: "OWNER" }] },
      },
    });
    communityId = community.id;
    await login(page, user.email, password);
    await page.goto(`/app/${community.slug}/games`);
    const catalogCard = page
      .locator(".arcade-catalog-card")
      .filter({ has: page.getByRole("heading", { name: "Torre em Equilíbrio" }) });
    await catalogCard.scrollIntoViewIfNeeded();
    await expect(catalogCard).toBeInViewport();
    await catalogCard.getByRole("link", { name: "Jogar agora" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/${community.slug}/games/tower-stack$`));
    await expect(page.getByRole("heading", { name: "Torre em Equilíbrio" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole("button", { name: "Começar construção" }).click();
    const dropButton = page.getByRole("button", { name: "Soltar bloco" });
    await expect(page.getByText("Bloco 1 no pêndulo. Toque para soltar.")).toBeVisible();
    await expect
      .poll(
        () =>
          db.towerStackRun.findFirst({
            where: { communityId: community.id, userId: user.id, status: "ACTIVE" },
          }),
        { timeout: 5_000 },
      )
      .not.toBeNull();
    const active = await db.towerStackRun.findFirstOrThrow({
      where: { communityId: community.id, userId: user.id, status: "ACTIVE" },
    });
    const floorCounter = page.locator(".tower-stack-hud span").nth(1).locator("strong");
    await expect(floorCounter).toHaveText("0");

    for (const livesLeft of [2, 1, 0]) {
      await expect(dropButton).toBeEnabled({ timeout: 5_000 });
      const nextLevel = Number(await floorCounter.textContent()) + 1;
      const edgeOfSwingMs =
        (Math.PI / 2 / towerBlockSpec(active.seed, nextLevel).swingSpeed) * 1_000;
      await page.waitForTimeout(edgeOfSwingMs);
      await dropButton.click();
      if (livesLeft > 0)
        await expect(page.getByText(new RegExp(`Restam ${livesLeft} vida`))).toBeVisible({
          timeout: 5_000,
        });
    }
    await expect(page.getByRole("button", { name: "Construir novamente" })).toBeVisible({
      timeout: 6_000,
    });
    await expect(page.getByText(/Resultado salvo no ranking/)).toBeVisible();
    expect(
      await db.towerStackRun.count({
        where: {
          communityId: community.id,
          userId: user.id,
          status: "FINISHED",
          score: 0,
          blocksPlaced: 0,
          livesRemaining: 0,
        },
      }),
    ).toBe(1);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
