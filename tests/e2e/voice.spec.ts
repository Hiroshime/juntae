import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const database = new PrismaClient();
const suffix = randomUUID();
const password = "senha-e2e-123";
let userId = "";
let communityId = "";
let communitySlug = "";
let email = "";

test.beforeAll(async () => {
  email = `voice-${suffix}@e2e.local`;
  const user = await database.user.create({
    data: {
      email,
      name: "Owner Voz E2E",
      passwordHash: await hash(password, 4),
    },
  });
  userId = user.id;
  const community = await database.community.create({
    data: {
      name: `Voz E2E ${suffix}`,
      slug: `voz-e2e-${suffix}`,
      createdById: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
      voiceChannels: {
        create: {
          createdById: user.id,
          name: "Geral",
          nameKey: "geral",
          description: "Sala principal da comunidade.",
          maxParticipants: 12,
        },
      },
    },
  });
  communityId = community.id;
  communitySlug = community.slug;
});

test.afterAll(async () => {
  if (communityId) await database.community.deleteMany({ where: { id: communityId } });
  if (userId) await database.user.deleteMany({ where: { id: userId } });
  await database.$disconnect();
});

test("organiza canais e orienta a configuração antes do LiveKit", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(`/app/${communitySlug}/social`);
  await page.getByRole("link", { name: "Voz", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/app/${communitySlug}/social/voice$`));
  await expect(page.getByRole("heading", { name: "Salas de voz" })).toBeVisible();
  await expect(page.getByText("Servidor de voz aguardando configuração")).toBeVisible();
  await expect(page.getByText("Geral", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" }).first()).toBeDisabled();

  await page.getByText("Adicionar sala de voz").click();
  await page.getByLabel("Nome").fill("Resenha");
  await page.getByLabel("Descrição (opcional)").fill("Conversa livre");
  await page.getByLabel("Limite de pessoas").fill("6");
  await page.getByRole("button", { name: "Criar sala" }).click();
  await expect(page.getByText("Resenha", { exact: true })).toBeVisible();
  await expect(page.getByText("0/6 conectados")).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Remover sala Resenha" }).click();
  await expect(page.getByText("Resenha", { exact: true })).toHaveCount(0);

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
