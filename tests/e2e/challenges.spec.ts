import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("desafios: criar, editar, participar e cancelar com privacidade e acesso mobile", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = await db.user.create({
    data: {
      name: "Atleta E2E",
      email: `challenge-e2e-${suffix}@test.local`,
      passwordHash: await hash("senha-desafio-e2e", 4),
    },
  });
  let communityId: string | undefined;
  try {
    const community = await db.community.create({
      data: {
        name: "Turma em movimento",
        slug: `desafio-${suffix}`,
        createdById: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    communityId = community.id;
    const path = `/app/${community.slug}/challenges`;
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-desafio-e2e");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app/);
    await page.goto(path);
    await expect(page.getByText("Nenhum desafio por aqui")).toBeVisible();
    await page.getByRole("link", { name: "Criar desafio", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByLabel("Nome do desafio").fill("30 dias em movimento");
    await page.getByLabel("Descrição (opcional)").fill("Vamos caminhar juntos!");
    await page
      .getByLabel("Regras combinadas")
      .fill("Valem caminhadas e corridas registradas durante o período.");
    await page.getByRole("button", { name: "Desabilitar todas" }).click();
    await page.getByRole("checkbox", { name: "Corrida", exact: true }).check();
    await page.getByLabel("Pontos por treino — Corrida", { exact: true }).fill("20");
    await page.getByLabel("Modalidade personalizada").fill("Beach tennis");
    await page.getByRole("button", { name: "Adicionar modalidade", exact: true }).click();
    await page.getByLabel("Pontos por treino — Beach tennis", { exact: true }).fill("15");
    await page.getByRole("button", { name: "Criar desafio", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}/[a-f0-9-]{36}$`));
    await expect(page.getByRole("heading", { name: "30 dias em movimento" })).toBeVisible();
    await expect(page.getByText("Corrida — 20 pts por treino", { exact: true })).toBeVisible();
    await expect(page.getByText("Beach tennis — 15 pts por treino", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Editar desafio", exact: true }).click();
    await expect(page.getByLabel("Pontos por treino — Beach tennis", { exact: true })).toHaveValue(
      "15",
    );
    await expect(page.getByRole("checkbox", { name: "Caminhada", exact: true })).not.toBeChecked();
    await page.getByLabel("Como comparar os treinos?").selectOption("DISTANCE");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Desafio atualizado.")).toBeVisible();
    await expect(page.getByText("Soma da distância dos treinos", { exact: true })).toBeVisible();
    const challengeId = page.url().split("/").at(-1)!;
    const endpoint = `/api/communities/${communityId}/challenges/${challengeId}`;
    // Reject malformed actions, cross-site mutation and unauthenticated reads/writes.
    expect(
      (
        await page.request.post(endpoint, { data: { action: "JOIN", userId: randomUUID() } })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post(endpoint, {
          headers: { origin: "https://invalid.test" },
          data: { action: "JOIN" },
        })
      ).status(),
    ).toBe(403);
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.post(`http://127.0.0.1:3100${endpoint}`, {
            data: { action: "JOIN" },
          })
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
    await page.getByRole("button", { name: "Participar do desafio" }).click();
    await expect(
      page.getByRole("heading", { name: "Participantes (1)", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar desafio", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Sair do desafio" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const theme of ["juntae", "classic", "solar", "ocean"]) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: "/tmp/juntae-challenges-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Sair do desafio" }).click();
    await expect(
      page.getByRole("heading", { name: "Participantes (0)", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar desafio", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Participar do desafio" }).click();
    await expect(
      page.getByRole("heading", { name: "Participantes (1)", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancelar desafio", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
    await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sair do desafio" })).toHaveCount(0);
    expect(await db.challengeParticipant.count({ where: { challengeId } })).toBe(1);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator(".mobile-more-menu > summary").click();
    await page
      .getByRole("navigation", { name: "Navegação principal da comunidade" })
      .getByRole("link", { name: "Desafios (Beta)", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: "30 dias em movimento" })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
