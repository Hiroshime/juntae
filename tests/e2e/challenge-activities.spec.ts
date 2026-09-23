import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { civilDateInTimeZone } from "../../src/lib/dates/civil-date";

test("treinos: publicação com álbum, ranking, privacidade e remoção no celular", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = await db.user.create({
    data: {
      name: "Atleta do álbum",
      email: `activity-${suffix}@test.local`,
      passwordHash: await hash("senha-treino-e2e", 4),
    },
  });
  let communityId: string | undefined;
  try {
    await page.context().setExtraHTTPHeaders({
      "x-forwarded-for": `e2e-activity-${suffix}`,
    });
    const community = await db.community.create({
      data: {
        name: "Treinos E2E",
        slug: `activity-${suffix}`,
        createdById: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    communityId = community.id;
    const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
    const challenge = await db.challenge.create({
      data: {
        communityId,
        createdById: user.id,
        title: "Caminhar faz bem",
        rules: "Caminhadas reais de pelo menos 10 minutos.",
        startDate: new Date(today),
        endDate: new Date(today),
        timezone: "America/Sao_Paulo",
        configuration: {
          version: 1,
          type: "FITNESS",
          scoring: { metric: "DISTANCE" },
          modalities: [
            { id: "WALK", label: "Caminhada", points: 10 },
            { id: "CUSTOM_1234567890abcdef12345678", label: "Caminhada na areia", points: 15 },
          ],
        },
      },
    });
    const endpoint = `/api/communities/${communityId}/challenges/${challenge.id}/activities`;
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-treino-e2e");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app/);
    await page.goto(`/app/${community.slug}/challenges/${challenge.id}`);
    expect((await page.request.post(endpoint, { data: {} })).status()).toBe(403);
    await page.getByRole("button", { name: "Participar do desafio" }).click();
    await expect(
      page.getByRole("heading", { name: "Registrar treino", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const form = page.getByRole("form", { name: "Registrar treino" });
    await expect(form.getByLabel("Tipo de treino").locator("option")).toHaveCount(2);
    await form.getByLabel("Tipo de treino").selectOption("CUSTOM_1234567890abcdef12345678");
    await form.getByLabel("Nome do treino").fill("Volta no parque");
    await form.getByLabel("Duração (minutos)").fill("30");
    await form.getByLabel("Distância (km)", { exact: true }).fill("3.5");
    await form.getByLabel("Como foi? (opcional)").fill("Treino com a turma!");
    const photos = await Promise.all(
      ["red", "blue"].map(async (background, index) => ({
        name: `foto-${index}.png`,
        mimeType: "image/png",
        buffer: await sharp({ create: { width: 40, height: 40, channels: 3, background } })
          .png()
          .toBuffer(),
      })),
    );
    await form.getByLabel("Fotos do treino", { exact: true }).setInputFiles(photos);
    await form.getByRole("button", { name: "Publicar treino" }).click();
    await expect(page.getByText("Treino publicado! O ranking foi atualizado.")).toBeVisible();
    await page.reload();
    const activity = page.getByRole("article", { name: "Volta no parque", exact: true });
    await expect(activity).toBeVisible();
    await expect(activity.getByText(/Caminhada na areia/)).toBeVisible();
    await expect(activity.getByText("+3,5 km", { exact: true })).toBeVisible();
    await expect(
      page.locator("#challenge-ranking").getByText("3,5 km", { exact: true }),
    ).toBeVisible();
    await expect(
      activity.getByRole("button", { name: "Ampliar foto 2 de Volta no parque" }),
    ).toBeVisible();
    const photoUrl = await activity
      .getByRole("img", { name: "Foto 1 de Volta no parque", exact: true })
      .getAttribute("src");
    const response = await page.request.get(photoUrl!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const anonymous = await browser.newContext();
    try {
      expect((await anonymous.request.get(`http://127.0.0.1:3100${photoUrl}`)).status()).toBe(401);
    } finally {
      await anonymous.close();
    }
    await activity.getByRole("button", { name: "Ampliar foto 1 de Volta no parque" }).click();
    const dialog = page.getByRole("dialog", { name: "Fotos de Volta no parque" });
    await expect(dialog).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByText("2 de 2", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      activity.getByRole("button", { name: "Ampliar foto 1 de Volta no parque" }),
    ).toBeFocused();
    await page.reload();
    await expect(activity).toBeVisible();
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
    // Another publication on the same civil day is rejected by the server.
    const extra = await page.request.post(endpoint, {
      multipart: {
        payload: JSON.stringify({
          clientRequestId: randomUUID(),
          title: "Outro treino",
          activityType: "WALK",
          performedOn: today,
          durationSeconds: 1800,
          distanceMeters: 2000,
        }),
        photos: photos[0],
      },
    });
    expect(extra.status()).toBe(409);
    await activity.getByRole("button", { name: "Remover treino" }).click();
    const deleteResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.startsWith(`${endpoint}/`) &&
        response.request().method() === "DELETE",
    );
    await activity.getByRole("button", { name: "Confirmar remoção" }).click();
    expect((await deleteResponse).status()).toBe(200);
    await page.reload();
    await expect(activity).toHaveCount(0);
    await expect(
      page.locator("#challenge-ranking").getByText("0 km", { exact: true }),
    ).toBeVisible();
    expect((await page.request.get(photoUrl!)).status()).toBe(404);
    expect(
      await db.challengeActivityPhoto.count({ where: { activity: { challengeId: challenge.id } } }),
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
