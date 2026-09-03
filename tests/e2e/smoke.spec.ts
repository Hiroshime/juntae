import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const browserErrors = new WeakMap<Page, string[]>();
const database = new PrismaClient();
const fixtureSuffix = randomUUID();
let invitationCommunityId = "";
let invitationAdminId = "";

test.beforeAll(async () => {
  const admin = await database.user.create({
    data: {
      email: `invitation-admin-${fixtureSuffix}@e2e.local`,
      name: "Administrador de convites E2E",
      passwordHash: await hash("senha-e2e-123", 4),
    },
  });
  const community = await database.community.create({
    data: {
      name: `Convites E2E ${fixtureSuffix}`,
      slug: `convites-e2e-${fixtureSuffix}`,
      createdById: admin.id,
    },
  });
  await database.communityMember.create({
    data: { communityId: community.id, userId: admin.id, role: "OWNER" },
  });
  invitationAdminId = admin.id;
  invitationCommunityId = community.id;
});

test.afterAll(async () => {
  if (invitationCommunityId) {
    await database.community.deleteMany({ where: { id: invitationCommunityId } });
  }
  if (invitationAdminId) {
    await database.user.deleteMany({ where: { id: invitationAdminId } });
  }
  await database.$disconnect();
});

async function openInvitedRegistration(page: Page) {
  const token = randomBytes(32).toString("base64url");
  await database.invite.create({
    data: {
      communityId: invitationCommunityId,
      createdById: invitationAdminId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      maxUses: 1,
    },
  });
  await page.goto(`/join/${token}`);
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page.getByText("Cadastro por convite")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  });
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], "erros inesperados no console do navegador").toEqual([]);
});

test("landing page is accessible", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.getByRole("heading", { name: "Quando todo mundo pode?" })).toBeVisible();
  await expect(page.getByText("Cadastro somente por convite")).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar no Juntaê" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("cadastro direto informa que o acesso é somente por convite", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Cadastro somente por convite" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta" })).toHaveCount(0);
});

test("tema visual pode ser escolhido e persiste", async ({ page }) => {
  await page.goto("/");
  const picker = page.locator(".theme-picker");
  await picker.locator("summary").click();
  await picker.getByRole("button", { name: "Clássico" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "classic");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    ),
  ).toBe("#4d35ba");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "classic");
  await expect(picker.locator("summary")).toHaveAttribute("title", "Tema: Clássico");
});

test("cadastro, comunidade e convite funcionam ponta a ponta", async ({ browser, page }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const communityName = `Turma E2E ${unique}`;

  await openInvitedRegistration(page);
  await page.getByLabel("Nome de exibição").fill("Owner E2E");
  await page.getByLabel("E-mail").fill(`owner-${unique}@e2e.local`);
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  await page.getByLabel("Confirmar senha").fill("senha-diferente-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.locator(".error[role='alert']")).toHaveText("As senhas não coincidem.");
  await page.getByLabel("Confirmar senha").fill("senha-e2e-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/convites-e2e-/);
  await page.goto("/app");

  await page.getByRole("button", { name: "Criar comunidade" }).click();
  await page.getByLabel("Nome").fill(communityName);
  await page.getByLabel("Descrição").fill("Criada pelo fluxo E2E");
  await page.getByRole("button", { name: "Criar comunidade", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: communityName })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNavigation = page.getByRole("navigation", {
    name: "Navegação principal da comunidade",
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Início" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByRole("button", { name: "Gerar link de convite" }).click();
  const inviteUrl = await page.locator(".generated-link code").textContent();
  expect(inviteUrl).toContain("/join/");

  const memberContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `e2e-member-${unique}` },
  });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(inviteUrl!);
  await memberPage.getByRole("link", { name: "Criar conta" }).click();
  await memberPage.getByLabel("Nome de exibição").fill("Membro E2E");
  await memberPage.getByLabel("E-mail").fill(`member-${unique}@e2e.local`);
  await memberPage.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  await memberPage.getByLabel("Confirmar senha").fill("senha-e2e-123");
  await memberPage.getByRole("button", { name: "Criar conta" }).click();
  await expect(memberPage.getByRole("heading", { name: communityName })).toBeVisible();
  await memberContext.close();

  const database = new PrismaClient();
  await database.community.deleteMany({ where: { name: communityName } });
  await database.user.deleteMany({
    where: {
      email: { in: [`owner-${unique}@e2e.local`, `member-${unique}@e2e.local`] },
    },
  });
  await database.$disconnect();
});

test("escala 12x36, calendário e override funcionam ponta a ponta", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `agenda-${unique}@e2e.local`;
  const communityName = `Agenda E2E ${unique}`;

  await openInvitedRegistration(page);
  await page.getByLabel("Nome de exibição").fill("Agenda E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  await page.getByLabel("Confirmar senha").fill("senha-e2e-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/convites-e2e-/);
  await page.goto("/app");
  await page.getByRole("button", { name: "Criar comunidade" }).click();
  await page.getByLabel("Nome").fill(communityName);
  await page.getByRole("button", { name: "Criar comunidade", exact: true }).last().click();

  await page.getByRole("link", { name: "Escalas" }).click();
  const initialDate = await page.getByLabel("Data inicial").inputValue();
  await page.getByLabel("Nome da escala").fill("Plantão 12x36 E2E");
  await page.getByLabel("Dias trabalhando").fill("1");
  await page.getByLabel("Dias de folga").fill("1");
  await page.getByRole("button", { name: "Visualizar prévia" }).click();
  await expect(page.getByLabel("Prévia da escala")).toContainText("Trabalhando");
  await expect(page.getByLabel("Prévia da escala")).toContainText("Folga");
  await page.getByRole("button", { name: "Criar escala" }).click();
  await expect(page.getByText("Escala recorrente criada.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plantão 12x36 E2E", level: 3 })).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).click();
  const scheduleEditForm = page.locator(".schedule-row .inline-edit-form");
  await scheduleEditForm.getByLabel("Nome da escala").fill("Plantão 12x36 atualizado");
  await scheduleEditForm.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Escala atualizada.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plantão 12x36 atualizado", level: 3 }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Minha agenda" }).click();
  await expect(page.getByLabel(`${initialDate}: Trabalhando`)).toBeVisible();
  await page.getByLabel("Data inicial").fill(initialDate);
  await page.getByLabel("Data final").fill(initialDate);
  await page.getByLabel("Observação opcional").fill("Troca de plantão E2E");
  await page.getByRole("button", { name: "Adicionar à agenda" }).click();
  await expect(page.getByLabel(`${initialDate}: Folga`)).toBeVisible();
  const overrideRow = page.locator(".override-row").first();
  await overrideRow.getByRole("button", { name: "Editar" }).click();
  await overrideRow.getByLabel("Status").selectOption("VACATION");
  await overrideRow.getByLabel("Observação").fill("Férias E2E");
  await overrideRow.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Ocorrência atualizada.")).toBeVisible();
  await expect(overrideRow.getByText("Férias", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Calendário" }).click();
  await expect(page.getByRole("heading", { name: "Quando todo mundo pode?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mês", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator(".calendar-month-day").first()).toBeVisible();
  await expect(page.getByText("Maior sobreposição")).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page.getByText("1 membro no cálculo").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Navegação principal da comunidade" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("checkbox", { name: "Somente fins de semana" }).check();
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/onlyWeekends=true/);
  await expect(page.getByText("Maior sobreposição")).toBeVisible();

  await page.locator(".brand").click();
  await expect(page.getByRole("heading", { name: "Quando mais gente consegue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Próximo fim de semana" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Próximos 7 dias" })).toBeVisible();

  const database = new PrismaClient();
  await database.community.deleteMany({ where: { name: communityName } });
  await database.user.deleteMany({ where: { email } });
  await database.$disconnect();
});

test("criação de evento e RSVP funcionam ponta a ponta", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `events-${unique}@e2e.local`;
  const communityName = `Eventos E2E ${unique}`;
  const eventName = `Jantar E2E ${unique}`;

  await openInvitedRegistration(page);
  await page.getByLabel("Nome de exibição").fill("Eventos E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  await page.getByLabel("Confirmar senha").fill("senha-e2e-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/convites-e2e-/);
  await page.goto("/app");
  await page.getByRole("button", { name: "Criar comunidade" }).click();
  await page.getByLabel("Nome").fill(communityName);
  await page.getByRole("button", { name: "Criar comunidade", exact: true }).last().click();

  const opportunityLink = page
    .locator(".opportunity-card")
    .first()
    .getByRole("link", { name: "Criar evento" });
  const opportunityHref = await opportunityLink.getAttribute("href");
  const bestDate = new URL(opportunityHref!, "http://127.0.0.1:3100").searchParams.get("date");
  expect(bestDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await opportunityLink.click();
  await expect(page.getByLabel("Início")).toHaveValue(new RegExp(`^${bestDate}T`));
  await page.getByLabel("Título").fill(eventName);
  await page.getByLabel("Descrição").fill("Evento criado pelo teste ponta a ponta");
  await page.getByLabel("Início").fill(`${bestDate}T19:00`);
  await page.getByLabel(/Término/).fill(`${bestDate}T22:00`);
  await page.getByLabel("Local", { exact: true }).fill("Restaurante E2E");
  await page.getByLabel("Custo estimado").fill("90");
  await page.getByLabel("Limite de participantes").fill("1");
  await page.getByRole("button", { name: "Criar evento", exact: true }).click();

  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compartilhar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar link" })).toBeVisible();
  const perConfirmedCost = page.getByText("Por pessoa confirmada").locator("..");
  await expect(perConfirmedCost).toContainText("Aguardando confirmações");
  const eventPath = new URL(page.url()).pathname;
  await page.context().clearCookies();
  await page.goto(eventPath);
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(eventPath);
  await expect(
    page.getByText("Ainda não tem conta? Peça um convite a um administrador."),
  ).toBeVisible();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  const loginResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/login",
  );
  await page.getByRole("button", { name: "Entrar" }).click();
  expect((await loginResponsePromise).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`${eventPath.replaceAll("/", "\\/")}$`), {
    timeout: 15_000,
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        document.body.dataset.shared = "true";
      },
    });
  });
  await page.getByRole("button", { name: "Compartilhar" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-shared", "true");
  await page.getByRole("button", { name: "Vou", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vou", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("1 resposta", { exact: false })).toBeVisible();
  await expect(page.getByText("0 vagas restantes")).toBeVisible();
  await expect(perConfirmedCost).toContainText("R$ 90,00");

  await page.getByRole("link", { name: communityName }).click();
  await expect(page.getByRole("heading", { name: "Próximos eventos" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(eventName) })).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible();

  const database = new PrismaClient();
  await database.community.deleteMany({ where: { name: communityName } });
  await database.user.deleteMany({ where: { email } });
  await database.$disconnect();
});

test("votação de datas, voto e alteração funcionam ponta a ponta", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `polls-${unique}@e2e.local`;
  const communityName = `Votações E2E ${unique}`;
  const pollName = `Melhor data E2E ${unique}`;

  await openInvitedRegistration(page);
  await page.getByLabel("Nome de exibição").fill("Votante E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  await page.getByLabel("Confirmar senha").fill("senha-e2e-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/convites-e2e-/);
  await page.goto("/app");
  await page.getByRole("button", { name: "Criar comunidade" }).click();
  await page.getByLabel("Nome").fill(communityName);
  await page.getByRole("button", { name: "Criar comunidade", exact: true }).last().click();

  await page.getByRole("link", { name: "Votações", exact: true }).click();
  await page.getByRole("link", { name: "Criar votação" }).first().click();
  await page.getByLabel("Título").fill(pollName);
  await page.getByLabel("Descrição").fill("Escolha todas as datas possíveis");
  await page.getByLabel("Tipo de votação").selectOption("DATE_OPTIONS");
  await expect(page.getByText("3 datas selecionadas.")).toBeVisible();
  await page.getByRole("button", { name: "Criar votação", exact: true }).click();

  await expect(page.getByRole("heading", { name: pollName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compartilhar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar link" })).toBeVisible();
  const voteOptions = page.locator(".vote-option input");
  await voteOptions.nth(0).check();
  await page.getByRole("button", { name: "Registrar voto" }).click();
  await expect(page.getByText("Voto registrado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 votante" })).toBeVisible();

  await voteOptions.nth(0).uncheck();
  await voteOptions.nth(1).check();
  await page.getByRole("button", { name: "Atualizar voto" }).click();
  await expect(page.getByText("Voto atualizado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 votante" })).toBeVisible();
  await expect(page.getByText("0 disponíveis").first()).toBeVisible();
  await expect(page.getByText("1 sem informação").first()).toBeVisible();

  await page.getByRole("link", { name: communityName }).click();
  await expect(page.getByRole("heading", { name: "Votações", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(pollName) })).toBeVisible();

  const database = new PrismaClient();
  await database.community.deleteMany({ where: { name: communityName } });
  await database.user.deleteMany({ where: { email } });
  await database.$disconnect();
});

test("sorteio de times e histórico funcionam ponta a ponta", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `randomizer-${unique}@e2e.local`;
  const communityName = `Sorteios E2E ${unique}`;

  await openInvitedRegistration(page);
  await page.getByLabel("Nome de exibição").fill("Sorteador E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  await page.getByLabel("Confirmar senha").fill("senha-e2e-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/convites-e2e-/);
  await page.goto("/app");
  await page.getByRole("button", { name: "Criar comunidade" }).click();
  await page.getByLabel("Nome").fill(communityName);
  await page.getByRole("button", { name: "Criar comunidade", exact: true }).last().click();

  await page.getByRole("link", { name: "Sorteios", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sorteia aí, Juntaê" })).toBeVisible();
  await page.getByLabel("Fonte").selectOption("MANUAL");
  await page.getByLabel("Um nome por linha").fill("Ana\nBruno\nCarla\nDaniel");
  await page.getByLabel("Quantidade de times").fill("2");
  await page.getByLabel("Máximo por time").fill("2");
  await page.getByLabel("Nomes dos times, um por linha").fill("Roxos\nLaranjas");
  await page.getByRole("button", { name: "🎲 Sortear agora" }).click();

  await expect(page.getByText("Sorteio realizado com aleatoriedade segura.")).toBeVisible();
  const result = page.locator("#randomizer-result");
  await expect(result.getByRole("heading", { name: "Roxos" })).toBeVisible();
  await expect(result.getByRole("heading", { name: "Laranjas" })).toBeVisible();
  for (const name of ["Ana", "Bruno", "Carla", "Daniel"]) {
    await expect(result.getByText(name, { exact: true })).toHaveCount(1);
  }
  await result.getByLabel("Nome para salvar").fill("Times E2E salvos");
  await result.getByRole("button", { name: "Salvar resultado" }).click();
  await expect(page.getByText("Resultado salvo no histórico da comunidade.")).toBeVisible();
  await expect(result.getByRole("button", { name: "Compartilhar" })).toBeVisible();
  const permanentResultLink = result.getByRole("link", { name: /Abrir página permanente/ });
  const permanentResultPath = await permanentResultLink.getAttribute("href");
  expect(permanentResultPath).toMatch(/\/randomizers\/[0-9a-f-]+$/);
  await permanentResultLink.click();
  await expect(page).toHaveURL(new URL(permanentResultPath!, "http://127.0.0.1:3100").href);
  await expect(page.getByRole("heading", { name: "Times E2E salvos", level: 1 })).toBeVisible();
  await expect(page.getByText("Snapshot preservado")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  const database = new PrismaClient();
  await database.community.deleteMany({ where: { name: communityName } });
  await database.user.deleteMany({ where: { email } });
  await database.$disconnect();
});
