import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test("votação com almoço e jantar, sugestões configuráveis e votos independentes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const password = "senha-votacoes-e2e";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const users = await Promise.all(
    ["owner", "kelvin"].map(async (name) =>
      db.user.create({
        data: {
          name,
          email: `grouped-${name}-${suffix}@test.local`,
          passwordHash: await hash(password, 4),
        },
      }),
    ),
  );
  let communityId: string | undefined;
  try {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `grouped-polls-${suffix}` });
    const community = await db.community.create({
      data: {
        name: "Refeições",
        slug: `refeicoes-${suffix}`,
        createdById: users[0].id,
        members: { create: [{ userId: users[0].id, role: "OWNER" }, { userId: users[1].id }] },
      },
    });
    communityId = community.id;
    async function login(index: number) {
      await page.goto("/login");
      await page.getByLabel("E-mail").fill(users[index].email);
      await page.getByLabel("Senha", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page).toHaveURL(/\/app/);
    }
    await login(0);
    await page.goto(`/app/${community.slug}/polls/new`);
    await page.getByLabel("Título", { exact: true }).fill("Refeições do passeio");
    await page.getByLabel("Tipo de votação").selectOption("GROUPED");
    await page.getByRole("button", { name: "Adicionar pergunta", exact: true }).click();
    const third = page.getByRole("group", { name: "Pergunta 3", exact: true });
    await third.getByLabel("Título da pergunta").fill("Extra um");
    await page.getByLabel("Tipo de votação").selectOption("SINGLE_CHOICE");
    await page.getByLabel("Tipo de votação").selectOption("GROUPED");
    await page.getByRole("button", { name: "Adicionar pergunta", exact: true }).click();
    await page
      .getByRole("group", { name: "Pergunta 4", exact: true })
      .getByLabel("Título da pergunta")
      .fill("Extra dois");
    await expect(third.getByLabel("Título da pergunta")).toHaveValue("Extra um");
    await page.getByRole("button", { name: "Remover pergunta 4", exact: true }).click();
    await page.getByRole("button", { name: "Remover pergunta 3", exact: true }).click();
    const q1 = page.getByRole("group", { name: "Pergunta 1", exact: true });
    const q2 = page.getByRole("group", { name: "Pergunta 2", exact: true });
    await q1.getByLabel("Título da pergunta").fill("Almoço");
    await q1.getByLabel("Opção 1", { exact: true }).fill("Churrasco");
    await q1.getByLabel("Opção 2", { exact: true }).fill("Macarrão");
    await q2.getByLabel("Título da pergunta").fill("Jantar");
    await q2.getByLabel("Como votar nesta pergunta").selectOption("MULTIPLE_CHOICE");
    await q2.getByLabel("Opção 1", { exact: true }).fill("Pizza");
    await q2.getByLabel("Opção 2", { exact: true }).fill("Cachorro-quente");
    const pizzaEditor = q2.locator(".poll-option-editor").first();
    await pizzaEditor.getByText("Adicionar álbum, descrição, página ou local").click();
    await pizzaEditor.getByLabel("Fotos do álbum").setInputFiles({
      name: "pizza.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await page.getByLabel("Permitir que membros adicionem opções").check();
    await page.getByRole("button", { name: "Criar votação", exact: true }).click();
    await expect(page).toHaveURL(/\/polls\/[0-9a-f-]+$/);
    const pollUrl = page.url();
    const pollId = pollUrl.split("/").at(-1)!;
    await expect(
      page
        .getByRole("region", { name: "Pergunta: Jantar", exact: true })
        .getByRole("button", { name: "Ampliar foto 1 de Pizza" })
        .first(),
    ).toBeVisible();
    await page.request.post("/api/auth/logout");
    await login(1);
    await page.goto(pollUrl);
    const lunch = page.getByRole("region", { name: "Pergunta: Almoço", exact: true });
    const dinner = page.getByRole("region", { name: "Pergunta: Jantar", exact: true });
    await lunch.locator("summary").filter({ hasText: "Adicionar opção" }).click();
    const suggestion = lunch.getByRole("form", { name: "Adicionar opção: Almoço", exact: true });
    await suggestion.getByLabel("Nova opção", { exact: true }).fill("Yakisoba");
    await suggestion.getByRole("button", { name: "Adicionar à votação" }).click();
    await expect(lunch.getByLabel("Votar em Yakisoba")).toBeVisible();
    await lunch.getByLabel("Votar em Yakisoba").check();
    await lunch.getByRole("button", { name: "Registrar voto", exact: true }).click();
    await expect(lunch.getByRole("button", { name: "Atualizar voto", exact: true })).toBeVisible();
    await dinner.getByLabel("Votar em Pizza").check();
    await dinner.getByLabel("Votar em Cachorro-quente").check();
    await dinner.getByRole("button", { name: "Registrar voto", exact: true }).click();
    await expect(page.getByText(/Você respondeu 2 de 2 perguntas/)).toBeVisible();
    await expect(lunch.getByRole("progressbar", { name: "100% dos votantes" })).toHaveCount(1);
    await expect(dinner.getByRole("progressbar", { name: "100% dos votantes" })).toHaveCount(2);
    await lunch.getByRole("button", { name: "Remover voto", exact: true }).click();
    await expect(page.getByText(/Você respondeu 1 de 2 perguntas/)).toBeVisible();
    await expect(dinner.getByRole("button", { name: "Atualizar voto", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath("votacao-refeicoes-mobile.png"),
      fullPage: true,
    });

    await page.request.post("/api/auth/logout");
    await login(0);
    await page.goto(`${pollUrl}/edit`);
    await page.getByLabel("Permitir que membros adicionem opções").uncheck();
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await expect(page).toHaveURL(pollUrl);
    await page.request.post("/api/auth/logout");
    await login(1);
    await page.goto(pollUrl);
    await expect(page.locator(".poll-add-option")).toHaveCount(0);
    const lunchQuestion = await db.pollQuestion.findFirstOrThrow({
      where: { pollId, title: "Almoço" },
    });
    const forbidden = await page.request.post(
      `/api/communities/${communityId}/polls/${pollId}/options`,
      { data: { label: "Arroz", questionId: lunchQuestion.id } },
    );
    expect(forbidden.status()).toBe(403);
    await expect(lunch.getByLabel("Votar em Yakisoba")).toBeVisible();
    await expect(dinner.getByRole("button", { name: "Atualizar voto", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await db.$disconnect();
  }
});
