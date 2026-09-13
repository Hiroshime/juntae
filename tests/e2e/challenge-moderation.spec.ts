import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { addCivilDays, civilDateInTimeZone } from "../../src/lib/dates/civil-date";

test("moderação mobile: motivo, restauração, histórico e resultado definitivo", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const userIds: string[] = [];
  let communityId: string | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const passwordHash = await hash("senha-moderacao-e2e", 4);
    const owner = await db.user.create({
      data: { name: "Organizador", email: `moderator-${suffix}@test.local`, passwordHash },
    });
    userIds.push(owner.id);
    const athlete = await db.user.create({
      data: { name: "Atleta do desafio", email: `athlete-${suffix}@test.local`, passwordHash },
    });
    userIds.push(athlete.id);
    const community = await db.community.create({
      data: {
        name: "Revisão E2E",
        slug: `moderation-${suffix}`,
        createdById: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: athlete.id, role: "MEMBER" },
          ],
        },
      },
    });
    communityId = community.id;
    const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
    const challenge = await db.challenge.create({
      data: {
        communityId,
        createdById: owner.id,
        title: "Treinar juntos",
        rules: "Treinos de pelo menos dez minutos.",
        startDate: new Date(today),
        endDate: new Date(today),
        timezone: "America/Sao_Paulo",
        firstJoinedAt: new Date(),
        configuration: {
          version: 1,
          type: "FITNESS",
          scoring: { metric: "POINTS", pointsPerActivity: 10 },
        },
        participants: { create: { userId: athlete.id } },
      },
    });
    const workout = await db.challengeActivity.create({
      data: {
        challengeId: challenge.id,
        userId: athlete.id,
        clientRequestId: randomUUID(),
        requestHash: "test-fixture",
        title: "Corrida para revisar",
        activityType: "RUN",
        performedOn: new Date(today),
        durationSeconds: 1800,
        score: 10,
      },
    });
    const endpoint = `/api/communities/${communityId}/challenges/${challenge.id}`;
    const moderationEndpoint = `${endpoint}/activities/${workout.id}/moderation`;
    const input = {
      action: "INVALIDATE",
      reason: "Não cumpriu a regra combinada.",
      expectedVersion: 0,
    };
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.post(`http://127.0.0.1:3100${moderationEndpoint}`, {
            data: input,
          })
        ).status(),
      ).toBe(401);
      expect(
        (await anonymous.request.post(`http://127.0.0.1:3100${endpoint}/finalize`)).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(owner.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-moderacao-e2e");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app/);
    await page.setViewportSize({ width: 390, height: 844 });
    const path = `/app/${community.slug}/challenges/${challenge.id}`;
    await page.goto(path);
    const card = page.getByRole("article", { name: "Corrida para revisar" });
    const ranking = page.locator("#challenge-ranking");
    await expect(ranking.getByText("10 pts", { exact: true })).toBeVisible();
    expect(
      (
        await page.request.post(moderationEndpoint, {
          data: input,
          headers: { origin: "https://attacker.invalid" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(`${endpoint}/finalize`, {
          headers: { origin: "https://attacker.invalid" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await page.request.post(moderationEndpoint, { data: { ...input, reason: "" } })).status(),
    ).toBe(400);
    expect((await page.request.post(`${endpoint}/finalize`)).status()).toBe(409);
    await card.getByRole("button", { name: "Desconsiderar treino", exact: true }).click();
    await card.getByLabel("Motivo da revisão").fill(input.reason);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await card.getByRole("button", { name: "Confirmar revisão" }).click();
    await expect(card.getByText("Desconsiderado · não pontua")).toBeVisible();
    await expect(ranking.getByText("0 pts", { exact: true })).toBeVisible();
    await expect(page.locator("#challenge-audit").getByText(input.reason)).toBeVisible();
    await card.getByRole("button", { name: "Restabelecer treino", exact: true }).click();
    await card.getByLabel("Motivo da revisão").fill("Comprovante revisado e aceito.");
    await card.getByRole("button", { name: "Confirmar revisão" }).click();
    await expect(ranking.getByText("10 pts", { exact: true })).toBeVisible();
    await db.challenge.update({
      where: { id: challenge.id },
      data: {
        startDate: new Date(addCivilDays(today, -2)),
        endDate: new Date(addCivilDays(today, -1)),
      },
    });
    await page.reload();
    await page.getByRole("button", { name: "Consolidar resultado final" }).click();
    await expect(page.getByText(/Esta ação é definitiva/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar resultado definitivo" }).click();
    await expect(page.getByRole("heading", { name: "Resultado final", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Desconsiderar treino" })).toHaveCount(0);
    expect(
      (
        await page.request.post(moderationEndpoint, { data: { ...input, expectedVersion: 2 } })
      ).status(),
    ).toBe(409);
    await db.communityMember.delete({
      where: { communityId_userId: { communityId, userId: athlete.id } },
    });
    await page.reload();
    await expect(card).toHaveCount(0);
    await expect(ranking.getByText("Atleta do desafio", { exact: true })).toBeVisible();
    await expect(ranking.getByText("10 pts", { exact: true })).toBeVisible();
    for (const theme of ["juntae", "classic", "solar", "ocean"]) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});
