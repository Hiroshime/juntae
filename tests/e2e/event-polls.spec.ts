import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test("evento: criar votação vinculada, trocar/remover vínculo e preservar voto e filtros", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = await db.user.create({
    data: {
      name: "Organizador",
      email: `event-polls-${suffix}@test.local`,
      passwordHash: await hash("senha-vinculo-e2e", 4),
    },
  });
  let communityId: string | undefined;
  try {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `event-polls-${suffix}` });
    const community = await db.community.create({
      data: {
        name: "Passeios",
        slug: `event-polls-${suffix}`,
        createdById: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    communityId = community.id;
    const [first, second] = await Promise.all(
      ["Chácara", "Praia"].map((title) =>
        db.event.create({
          data: {
            communityId: community.id,
            createdById: user.id,
            title,
            startsAt: new Date("2030-09-10T12:00:00Z"),
          },
        }),
      ),
    );
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-vinculo-e2e");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app/);
    await page.goto(`/app/${community.slug}/events/${first.id}`);
    await page.getByRole("link", { name: "Criar votação", exact: true }).click();
    await expect(page.getByLabel("Evento relacionado (opcional)")).toHaveValue(first.id);
    await page.getByLabel("Título", { exact: true }).fill("O que vamos almoçar?");
    await page.getByLabel("Opção 1", { exact: true }).fill("Churrasco");
    await page.getByLabel("Opção 2", { exact: true }).fill("Macarrão");
    await page.getByRole("button", { name: "Criar votação", exact: true }).click();
    await expect(page).toHaveURL(/\/polls\/[0-9a-f-]+$/);
    const pollUrl = page.url();
    await expect(page.getByRole("link", { name: "Evento: Chácara →", exact: true })).toBeVisible();
    await page.getByLabel("Votar em Churrasco").check();
    await page.getByRole("button", { name: "Registrar voto", exact: true }).click();
    await expect(page.getByRole("heading", { name: "1 votante", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Evento: Chácara →", exact: true }).click();
    await page
      .getByRole("region", { name: "Votações deste evento", exact: true })
      .getByRole("link", { name: /O que vamos almoçar/ })
      .click();
    await expect(page).toHaveURL(pollUrl);
    await expect(
      page.getByRole("heading", { name: "O que vamos almoçar?", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(page.getByLabel("Evento relacionado (opcional)")).toHaveValue(first.id);
    await page.getByLabel("Evento relacionado (opcional)").selectOption(second.id);
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await expect(page.getByRole("link", { name: "Evento: Praia →", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "1 votante", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Evento: Praia →", exact: true }).click();
    await page.getByRole("link", { name: "Ver todas as votações", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("event")).toBe(second.id);
    await expect(page.getByRole("link", { name: /O que vamos almoçar/ })).toBeVisible();
    await page.getByRole("link", { name: "Encerradas", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("scope")).toBe("CLOSED");
    expect(new URL(page.url()).searchParams.get("event")).toBe(second.id);
    await expect(page.getByText("Nenhuma votação aqui", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Todas", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("scope")).toBe("ALL");
    expect(new URL(page.url()).searchParams.get("event")).toBe(second.id);
    await page.getByRole("link", { name: "Criar votação", exact: true }).click();
    await expect(page.getByLabel("Evento relacionado (opcional)")).toHaveValue(second.id);
    await page.goto(`${pollUrl}/edit`);
    await page.getByLabel("Evento relacionado (opcional)").selectOption("");
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await expect(page).toHaveURL(pollUrl);
    await expect(page.getByRole("link", { name: /^Evento:/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "1 votante", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto(`/app/${community.slug}/polls/new`);
    await expect(page.getByLabel("Evento relacionado (opcional)")).toHaveValue("");
    expect(errors).toEqual([]);
  } finally {
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
