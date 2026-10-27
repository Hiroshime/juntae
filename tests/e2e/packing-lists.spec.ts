import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test("listas: evento, casal, contribuição própria, agrupamento e fechamento", async ({ page }) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const password = "senha-listas-e2e";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const users = await Promise.all(
    ["Luiz", "Kelvin"].map(async (name) =>
      db.user.create({
        data: {
          name,
          email: `packing-e2e-${name.toLowerCase()}-${suffix}@test.local`,
          passwordHash: await hash(password, 4),
        },
      }),
    ),
  );
  let communityId: string | undefined;
  try {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `packing-e2e-${suffix}` });
    const community = await db.community.create({
      data: {
        name: "Turma das listas",
        slug: `listas-${suffix}`,
        createdById: users[0].id,
        members: { create: [{ userId: users[0].id, role: "OWNER" }, { userId: users[1].id }] },
      },
    });
    communityId = community.id;
    const event = await db.event.create({
      data: {
        communityId,
        createdById: users[0].id,
        title: "Passeio na chácara",
        startsAt: new Date("2027-01-20T12:00:00Z"),
      },
    });
    async function login(index: number) {
      await page.goto("/login");
      await page.getByLabel("E-mail").fill(users[index].email);
      await page.getByLabel("Senha", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page).toHaveURL(/\/app/);
    }
    await login(0);
    await page.goto(`/app/${community.slug}/events/${event.id}`);
    await page.getByRole("link", { name: "Criar lista", exact: true }).click();
    await expect(page.getByLabel("Evento relacionado (opcional)")).toHaveValue(event.id);
    await page.getByLabel("Título da lista").fill("Café da manhã");
    await page.getByRole("button", { name: "Criar lista", exact: true }).click();
    await expect(page).toHaveURL(/\/packing-lists\/[0-9a-f-]+$/);
    const listUrl = page.url();
    const add = page.getByRole("form", { name: "Adicionar item", exact: true });
    await add.getByLabel("Item", { exact: true }).fill("Café e leite");
    await add.getByLabel("Quantidade (opcional)").fill("2 litros de cada");
    await add.getByLabel("Responsável", { exact: true }).selectOption(users[0].id);
    await add.getByLabel("Nome do casal ou grupo (opcional)").fill("Luiz e Ana");
    await add.getByRole("button", { name: "Adicionar item", exact: true }).click();
    await expect(
      page.getByRole("article", { name: "Item Café e leite", exact: true }),
    ).toContainText("Luiz e Ana");
    await add.getByLabel("Item", { exact: true }).fill("Pão de queijo");
    await add.getByRole("button", { name: "Adicionar item", exact: true }).click();
    await expect(
      page.getByRole("article", { name: "Item Pão de queijo", exact: true }),
    ).toBeVisible();
    await page.goto(`/app/${community.slug}/events/${event.id}`);
    await page.getByRole("link", { name: /Café da manhã/ }).click();
    await expect(page).toHaveURL(listUrl);

    await page.request.post("/api/auth/logout");
    await login(1);
    await page.goto(listUrl);
    const bread = page.getByRole("article", { name: "Item Pão de queijo", exact: true });
    await bread.getByRole("button", { name: "Eu levo", exact: true }).click();
    await expect(bread).toContainText("Kelvin");
    await bread.getByRole("button", { name: "Editar item", exact: true }).click();
    await bread.getByLabel("Quantidade (opcional)").fill("2 pacotes");
    await bread.getByLabel("Nome do casal ou grupo (opcional)").fill("Kelvin e Bia");
    await bread.getByRole("button", { name: "Salvar item", exact: true }).click();
    await expect(bread).toContainText("Kelvin e Bia");
    await bread.getByRole("button", { name: "Marcar como levado", exact: true }).click();
    await expect(bread.getByText("Levado", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Item Café e leite", exact: true }).getByRole("button"),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Fechar lista", exact: true })).toHaveCount(0);
    await page.getByLabel("Visualização").selectOption("people");
    await expect(page.getByRole("heading", { name: "Kelvin e Bia", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Luiz e Ana", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("listas-mobile.png"), fullPage: true });
    await bread.getByRole("button", { name: "Liberar item", exact: true }).click();
    await expect(bread.getByText("A combinar", { exact: true })).toBeVisible();
    await expect(bread.getByText("Kelvin e Bia", { exact: true })).toHaveCount(0);

    await page.request.post("/api/auth/logout");
    await login(0);
    await page.goto(listUrl);
    await page.getByRole("button", { name: "Fechar lista", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reabrir lista", exact: true })).toBeVisible();
    await expect(page.getByRole("form", { name: "Adicionar item", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Lista fechada para alterações.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Reabrir lista", exact: true }).click();
    await expect(page.getByRole("form", { name: "Adicionar item", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await db.$disconnect();
  }
});
