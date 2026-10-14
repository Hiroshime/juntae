import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const database = new PrismaClient();
const suffix = randomUUID();
const password = "senha-ia-e2e";
let userId = "";
let communityId = "";
let communitySlug = "";
let email = "";

test.beforeAll(async () => {
  email = `ai-owner-${suffix}@e2e.local`;
  const user = await database.user.create({
    data: { email, name: "Owner IA", passwordHash: await hash(password, 4) },
  });
  userId = user.id;
  const community = await database.community.create({
    data: {
      name: "Comunidade IA E2E",
      slug: `ai-e2e-${suffix}`,
      createdById: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
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

test("admin configura o assistente e membros recebem um estado seguro quando desativado", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto(`/app/${communitySlug}/settings`);
  const section = page.locator("section.community-ai-settings");
  await expect(
    section.getByRole("heading", { name: "Assistente contextual da comunidade" }),
  ).toBeVisible();
  await section.getByLabel("Nome do assistente").fill("Amiga da Comunidade");
  await section.getByLabel("Modelo instalado no Ollama").fill("qwen3:1.7b");
  await section.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(section.getByText("Configuração da IA salva para esta comunidade.")).toBeVisible();

  await page.goto(`/app/${communitySlug}/ai`);
  await expect(page.getByRole("heading", { name: "Amiga da Comunidade" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A IA está desativada nesta comunidade" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
