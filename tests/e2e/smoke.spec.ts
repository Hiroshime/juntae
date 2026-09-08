import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { appInfo } from "@/lib/app-info";

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

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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
  const landingAccessibility = await new AxeBuilder({ page }).analyze();
  expect(landingAccessibility.violations).toEqual([]);

  await page.getByRole("link", { name: "Sobre", exact: true }).click();
  await expect(page).toHaveURL(/\/sobre$/);
  await expect(page.getByRole("heading", { name: "Informações do projeto" })).toBeVisible();
  await expect(page.getByText("Luiz Antonio Batista Rossato", { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Versão atual ${appInfo.version}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico de versões" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /github.com\/Hiroshime\/juntae/ })).toHaveAttribute(
    "href",
    "https://github.com/Hiroshime/juntae",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const aboutAccessibility = await new AxeBuilder({ page }).analyze();
  expect(aboutAccessibility.violations).toEqual([]);
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

  await page.getByRole("link", { name: "Sobre", exact: true }).click();
  await expect(page).toHaveURL(/\/sobre\?community=turma-e2e-/);
  await expect(page.getByRole("heading", { name: "Informações do projeto" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação da comunidade" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir aplicativo" })).toHaveCount(0);
  await page.getByRole("link", { name: "Voltar à comunidade" }).click();
  await expect(page.getByRole("heading", { name: communityName })).toBeVisible();

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
  const scheduleCreateForm = page
    .locator("form")
    .filter({ has: page.getByLabel("Nome da escala") })
    .first();
  const initialDate = await scheduleCreateForm.getByLabel("Data inicial").inputValue();
  await scheduleCreateForm.getByLabel("Nome da escala").fill("Plantão 12x36 E2E");
  await scheduleCreateForm.getByLabel("Dias trabalhando").fill("1");
  await scheduleCreateForm.getByLabel("Dias de folga").fill("1");
  await scheduleCreateForm.getByLabel("Início", { exact: true }).fill("19:00");
  await scheduleCreateForm.getByLabel("Fim", { exact: true }).fill("07:00");
  await scheduleCreateForm.getByRole("button", { name: "Visualizar prévia" }).click();
  await expect(page.getByLabel("Prévia da escala")).toContainText("Parcialmente disponível");
  await scheduleCreateForm.getByRole("button", { name: "Criar escala" }).click();
  await expect(page.getByText("Escala recorrente criada.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plantão 12x36 E2E", level: 3 })).toBeVisible();
  await expect(page.getByText(/19:00–07:00 \(noturno\)/)).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).click();
  const scheduleEditForm = page.locator(".schedule-row .inline-edit-form");
  await scheduleEditForm.getByLabel("Nome da escala").fill("Plantão 12x36 atualizado");
  await scheduleEditForm.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Escala atualizada.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plantão 12x36 atualizado", level: 3 }),
  ).toBeVisible();

  const extraDate = addDays(initialDate, 2);
  const extraDayCard = page
    .locator("section.card")
    .filter({ has: page.getByRole("heading", { name: "Minha folga extra" }) });
  await extraDayCard.getByLabel("Data inicial").fill(extraDate);
  await extraDayCard.getByLabel("Data final").fill(extraDate);
  await extraDayCard.getByLabel("Motivo ou observação").fill("Folga prêmio E2E");
  await extraDayCard.getByRole("button", { name: "Adicionar folga extra" }).click();
  await expect(page.getByText("Folga extra adicionada à sua agenda.")).toBeVisible();

  const holidayCard = page
    .locator("section.card")
    .filter({ has: page.getByRole("heading", { name: "Feriados da comunidade" }) });
  await holidayCard.getByLabel("Nome").fill("Feriado E2E");
  await holidayCard.getByLabel("Data").fill(initialDate);
  await holidayCard.getByRole("button", { name: "Adicionar feriado" }).click();
  await expect(page.getByText("Feriado adicionado ao calendário.")).toBeVisible();

  await page.getByRole("link", { name: "Minha agenda" }).click();
  await expect(
    page.getByLabel(new RegExp(`^${initialDate}: Parcialmente disponível`)),
  ).toBeVisible();
  await expect(page.getByLabel(`${extraDate}: Folga`)).toBeVisible();
  await expect(page.getByText("Feriado E2E")).toBeVisible();
  await page.getByLabel("Data inicial").fill(initialDate);
  await page.getByLabel("Data final").fill(initialDate);
  await page.getByLabel("Observação opcional").fill("Troca de plantão E2E");
  await page.getByRole("button", { name: "Adicionar à agenda" }).click();
  await expect(page.getByLabel(new RegExp(`^${initialDate}: Folga`))).toBeVisible();
  const overrideRow = page.locator(".override-row").filter({ hasText: "Troca de plantão E2E" });
  await overrideRow.getByRole("button", { name: "Editar" }).click();
  await overrideRow.getByLabel("Status").selectOption("VACATION");
  await overrideRow.getByLabel("Observação").fill("Férias E2E");
  await overrideRow.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Ocorrência atualizada.")).toBeVisible();
  const updatedOverrideRow = page.locator(".override-row").filter({ hasText: "Férias E2E" });
  await expect(updatedOverrideRow.getByText("Férias", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Calendário" }).click();
  await expect(page.getByRole("heading", { name: "Quando todo mundo pode?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mês", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator(".calendar-month-day").first()).toBeVisible();
  await expect(page.getByText("Maior sobreposição")).toBeVisible();
  const nextDayCard = page.locator(`.calendar-month-day[data-date="${addDays(initialDate, 1)}"]`);
  await expect(nextDayCard.locator(".calendar-period-summary")).toHaveCount(4);
  await expect(nextDayCard.locator(".calendar-period-summary").nth(0)).toContainText("0/1");
  await expect(nextDayCard.locator(".calendar-period-summary").nth(2)).toContainText("1/1");
  await expect(nextDayCard.locator(".calendar-period-summary").nth(3)).toContainText("1/1");
  await nextDayCard.click();
  await expect(page.getByText("Livre após 07:00 · Plantão 12x36 atualizado")).toBeVisible();
  await expect(page.getByLabel("Disponibilidade por período").locator(":scope > div")).toHaveCount(
    4,
  );
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

test("rateio com vários compradores calcula o acerto ponta a ponta", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = "senha-e2e-123";
  const testDatabase = new PrismaClient();
  const passwordHash = await hash(password, 4);
  const users = await Promise.all(
    ["José E2E", "Luiz E2E", "Maria E2E"].map((name, index) =>
      testDatabase.user.create({
        data: {
          email: `rateio-${index}-${unique}@e2e.local`,
          name,
          passwordHash,
        },
      }),
    ),
  );
  const community = await testDatabase.community.create({
    data: {
      name: `Rateio E2E ${unique}`,
      slug: `rateio-e2e-${unique}`,
      createdById: users[0].id,
      members: {
        create: users.map((user, index) => ({
          userId: user.id,
          role: index === 0 ? "OWNER" : "MEMBER",
        })),
      },
    },
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(users[0].email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole("link", { name: new RegExp(community.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/app/${community.slug}$`));
  await page.getByRole("link", { name: "Rateios", exact: true }).click();

  await page.getByLabel("Título").fill("Churrasco E2E");
  await page.getByLabel("Descrição").fill("Compras do fim de semana");
  for (const user of users) {
    await page.getByRole("checkbox", { name: user.name }).check();
  }
  await page.getByRole("button", { name: "Criar rateio" }).click();
  await expect(page.getByRole("heading", { name: "Churrasco E2E" })).toBeVisible();

  await page.getByLabel("Item").fill("Carnes");
  await page.getByLabel("Valor").fill("90");
  await page.getByLabel("Quem pagou").selectOption({ label: "José E2E" });
  await page.getByRole("button", { name: "Adicionar compra" }).click();
  await expect(page.getByText("Compra adicionada e rateio recalculado.")).toBeVisible();

  await page.getByLabel("Item").fill("Bebidas");
  await page.getByLabel("Valor").fill("60");
  await page.getByLabel("Quem pagou").selectOption({ label: "Luiz E2E" });
  await page.getByRole("button", { name: "Adicionar compra" }).click();
  await expect(page.getByText("Compra adicionada e rateio recalculado.")).toBeVisible();

  await expect(page.getByText("Total comprado").locator("..")).toContainText("R$ 150,00");
  await expect(page.locator(".settlement-row").filter({ hasText: "José E2E" })).toContainText(
    "R$ 40,00",
  );
  await expect(page.locator(".settlement-row").filter({ hasText: "Luiz E2E" })).toContainText(
    "R$ 10,00",
  );
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await testDatabase.community.delete({ where: { id: community.id } });
  await testDatabase.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await testDatabase.$disconnect();
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
  const eventDate = addDays(bestDate!, 1);
  const eventEndDate = addDays(eventDate, 2);
  await page.getByLabel("Título").fill(eventName);
  await page.getByLabel("Descrição").fill("Evento criado pelo teste ponta a ponta");
  await page.getByLabel("Início").fill(`${eventDate}T19:00`);
  await page.getByLabel(/Término/).fill(`${eventEndDate}T22:00`);
  await page.getByLabel("Local", { exact: true }).fill("Restaurante E2E");
  await page.getByLabel("Custo estimado").fill("90");
  await page.getByLabel("Limite de participantes").fill("1");
  await page.getByLabel(/Permitir a resposta/).uncheck();
  await page.getByLabel("Permitir participação em dias específicos").check();
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
  await expect(page.getByRole("button", { name: "Talvez", exact: true })).toHaveCount(0);
  await page.getByLabel("Vou somente em alguns dias").check();
  await page.locator(".attendance-day-grid input").nth(1).check();
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
  await page.getByLabel("Descrição", { exact: true }).fill("Escolha todas as datas possíveis");
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

  await page.getByRole("link", { name: "Votações", exact: true }).click();
  await page.getByRole("link", { name: "Criar votação" }).first().click();
  const richPollName = `Chácara E2E ${unique}`;
  await page.getByLabel("Título").fill(richPollName);
  await page.getByLabel("Opção 1", { exact: true }).fill("Recanto Verde");
  await page.getByLabel("Opção 2", { exact: true }).fill("Sítio Azul");
  const firstDetails = page.locator(".poll-option-details").first();
  await firstDetails.getByText("Adicionar álbum, descrição, página ou local").click();
  const imageBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await firstDetails.getByLabel("Fotos do álbum").setInputFiles([
    { name: "recanto.png", mimeType: "image/png", buffer: imageBuffer },
    { name: "piscina.png", mimeType: "image/png", buffer: imageBuffer },
  ]);
  await firstDetails.getByLabel("Descrição da opção").fill("Piscina e churrasqueira");
  await firstDetails.getByLabel("Página web").fill("https://example.com/recanto");
  await firstDetails.getByLabel("Local ou endereço").fill("Atibaia, SP");
  await page.getByRole("button", { name: "Criar votação", exact: true }).click();
  await expect(page.getByRole("heading", { name: richPollName })).toBeVisible();
  await expect(page.getByText("Piscina e churrasqueira").first()).toBeVisible();
  await expect(page.getByText("2 fotos").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Foto 1 de Recanto Verde" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Ampliar foto 1 de Recanto Verde" }).first().click();
  await expect(page.getByRole("dialog", { name: "Foto 1 de Recanto Verde" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Foto 1 de Recanto Verde ampliada" })).toBeVisible();
  const lightboxAccessibility = await new AxeBuilder({ page }).analyze();
  expect(lightboxAccessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Próxima foto" }).click();
  await expect(page.getByRole("dialog", { name: "Foto 2 de Recanto Verde" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Votar em Recanto Verde" })).not.toBeChecked();
  await expect(page.getByRole("link", { name: "Abrir página" }).first()).toHaveAttribute(
    "href",
    "https://example.com/recanto",
  );

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
