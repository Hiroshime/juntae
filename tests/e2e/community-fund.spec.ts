import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const database = new PrismaClient();
const suffix = randomUUID();
const password = "senha-fundao-e2e";
let ownerId = "";
let memberId = "";
let communityId = "";
let communitySlug = "";
let eventId = "";
let ownerEmail = "";
let memberEmail = "";

test.beforeAll(async () => {
  ownerEmail = `fund-owner-${suffix}@e2e.local`;
  memberEmail = `fund-member-${suffix}@e2e.local`;
  const passwordHash = await hash(password, 4);
  const [owner, member] = await Promise.all([
    database.user.create({ data: { email: ownerEmail, name: "Owner Fundão", passwordHash } }),
    database.user.create({ data: { email: memberEmail, name: "Membro Fundão", passwordHash } }),
  ]);
  ownerId = owner.id;
  memberId = member.id;
  const community = await database.community.create({
    data: {
      name: "Fundão E2E",
      slug: `fundao-${suffix}`,
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
  communitySlug = community.slug;
  const event = await database.event.create({
    data: {
      communityId,
      createdById: owner.id,
      title: "Chácara do Fundão",
      startsAt: new Date("2026-11-20T12:00:00Z"),
      endsAt: new Date("2026-11-20T22:00:00Z"),
      estimatedCost: 100,
      rsvps: { create: { userId: member.id, status: "GOING" } },
    },
  });
  eventId = event.id;
});

test.afterAll(async () => {
  if (communityId) await database.community.deleteMany({ where: { id: communityId } });
  await database.user.deleteMany({ where: { id: { in: [ownerId, memberId].filter(Boolean) } } });
  await database.$disconnect();
});

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("membro registra aporte e administrador confirma o saldo", async ({ browser, page }) => {
  await login(page, memberEmail);
  await page.goto(`/app/${communitySlug}/fund`);
  await expect(page.getByRole("heading", { name: "Fundão da comunidade" })).toBeVisible();
  await expect(page.getByText("Os administradores ainda não configuraram o PIX.")).toBeVisible();
  await page.getByLabel("Valor").fill("50.00");
  await page.getByLabel("Mês de referência").fill("2026-10");
  await page.getByLabel("Data do pagamento").fill("2026-10-13");
  await page.getByRole("button", { name: "Enviar para confirmação" }).click();
  await expect(page.getByText("Depósito enviado para confirmação.")).toBeVisible();
  await expect(page.getByText(/R\$\s*50,00/).first()).toBeVisible();
  await expect(page.getByText("Aguardando confirmação", { exact: true }).last()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const ownerContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `fund-owner-${suffix}` },
  });
  const ownerPage = await ownerContext.newPage();
  try {
    await login(ownerPage, ownerEmail);
    await ownerPage.goto(`/app/${communitySlug}/fund`);
    await ownerPage.getByRole("button", { name: "Confirmar" }).click();
    await expect(ownerPage.getByText("Depósito confirmado e saldo atualizado.")).toBeVisible();
    await expect(ownerPage.getByText("Confirmado", { exact: true }).last()).toBeVisible();

    await ownerPage.goto(`/app/${communitySlug}/events/${eventId}`);
    await ownerPage.getByRole("button", { name: "Habilitar controle de pagamentos" }).click();
    await expect(ownerPage.getByText("Controle de pagamentos habilitado.")).toBeVisible();
    await ownerPage.goto(`/app/${communitySlug}/fund`);
    await ownerPage.getByText("Usar saldo em uma atividade", { exact: true }).click();
    await ownerPage.getByLabel("Membro", { exact: true }).selectOption(memberId);
    await ownerPage.getByLabel("Evento (opcional)").selectOption(eventId);
    await ownerPage.getByLabel("Valor utilizado").fill("10.00");
    await ownerPage.getByLabel("Data", { exact: true }).fill("2026-11-20");
    await ownerPage.getByLabel("Finalidade").fill("Entrada da chácara");
    await ownerPage.getByRole("button", { name: "Registrar uso do saldo" }).click();
    await expect(ownerPage.getByText("Uso do saldo registrado.")).toBeVisible();

    await ownerPage.goto(`/app/${communitySlug}/events/${eventId}`);
    const account = ownerPage.locator("#conta");
    await expect(account.getByText("Crédito do Fundão", { exact: true }).first()).toBeVisible();
    await expect(account.getByText(/R\$\s*10,00/).first()).toBeVisible();
    await expect(account.getByText(/R\$\s*90,00/).first()).toBeVisible();

    await database.eventPayment.create({
      data: {
        eventId,
        userId: memberId,
        recordedById: ownerId,
        amountCents: BigInt(9_000),
        direction: "RECEIVED",
        note: "Quitação do teste",
      },
    });
    await ownerPage.goto(`/app/${communitySlug}/fund`);
    const usagePanel = ownerPage.locator("details").filter({
      hasText: "Usar saldo em uma atividade",
    });
    await usagePanel.getByText("Usar saldo em uma atividade", { exact: true }).click();
    await usagePanel.getByLabel("Membro", { exact: true }).selectOption(memberId);
    await usagePanel.getByLabel("Evento (opcional)").selectOption(eventId);
    await usagePanel.getByLabel("Valor utilizado").fill("1.00");
    await usagePanel.getByLabel("Data", { exact: true }).fill("2026-11-20");
    await usagePanel.getByLabel("Finalidade").fill("Tentativa após quitação");
    await usagePanel.getByRole("button", { name: "Registrar uso do saldo" }).click();
    await expect(usagePanel.getByRole("alert")).toHaveText(
      "A conta deste membro já está quitada ou possui crédito a favor. O Fundão só pode abater valores ainda pendentes.",
    );
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await ownerContext.close();
  }
});
