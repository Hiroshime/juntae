import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test("divisão por noites, visitante, almoço por dia e acerto preservado no fechamento", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const users = await Promise.all(
    ["Luiz", "Kelvin", "Urias", "Visitante"].map(async (name) =>
      db.user.create({
        data: {
          name,
          email: `night-${name.toLowerCase()}-${suffix}@test.local`,
          passwordHash: await hash("senha-diarias-e2e", 4),
        },
      }),
    ),
  );
  let communityId: string | undefined;
  try {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `period-billing-${suffix}` });
    const community = await db.community.create({
      data: {
        name: "Passeio por noites",
        slug: `night-${suffix}`,
        createdById: users[0].id,
        members: {
          create: users.map((user, index) => ({
            userId: user.id,
            role: index ? "MEMBER" : "OWNER",
          })),
        },
      },
    });
    communityId = community.id;
    const event = await db.event.create({
      data: {
        communityId,
        createdById: users[0].id,
        title: "Fim de semana na chácara",
        startsAt: new Date("2026-11-20T18:00:00Z"),
        endsAt: new Date("2026-11-22T15:00:00Z"),
        estimatedCost: 1200,
        billingMode: "NIGHT",
        allowPartialAttendance: true,
        rsvps: {
          create: users.map((user, index) => ({
            userId: user.id,
            status: "GOING",
            attendingSpecificDays: index >= 2,
            ...(index >= 2
              ? {
                  attendanceDays: {
                    create: { date: new Date(index === 2 ? "2026-11-20" : "2026-11-21") },
                  },
                }
              : {}),
          })),
        },
      },
    });
    const eventUrl = `/app/${community.slug}/events/${event.id}`;
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(users[0].email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-diarias-e2e");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app/);
    await page.goto(eventUrl);
    const billing = page.getByRole("region", { name: "Divisão do custo do evento", exact: true });
    await expect(billing.getByText(/presença parcial não informa pernoite/)).toBeVisible();
    await billing.getByText("Configurar divisão e participantes", { exact: true }).click();
    const firstNight = billing.getByRole("group", { name: "Noite de 2026-11-20", exact: true });
    const secondNight = billing.getByRole("group", { name: "Noite de 2026-11-21", exact: true });
    await firstNight.getByLabel("Urias", { exact: true }).check();
    await expect(firstNight.getByLabel("Visitante", { exact: true })).not.toBeChecked();
    await expect(secondNight.getByLabel("Urias", { exact: true })).not.toBeChecked();
    await expect(firstNight.getByLabel("Urias", { exact: true })).toBeVisible();
    await expect(firstNight.getByLabel("Urias", { exact: true })).toHaveCSS("opacity", "1");
    const preview = billing.locator(".billing-preview");
    await expect(preview.getByText(/^Luiz:/)).toContainText("500,00");
    await expect(preview.getByText(/^Kelvin:/)).toContainText("500,00");
    await expect(preview.getByText(/^Urias:/)).toContainText("200,00");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await billing.getByRole("button", { name: "Salvar divisão", exact: true }).click();
    await expect(
      page.getByText("Divisão do evento salva e valores recalculados.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Habilitar controle de pagamentos", exact: true })
      .click();
    const account = page.locator("#conta");
    const person = (name: string) =>
      account.getByRole("article", { name: `Conta de ${name}`, exact: true });
    await expect(person("Luiz").locator(".account-due")).toContainText("500,00");
    await expect(person("Urias").locator(".account-due")).toContainText("200,00");
    await expect(person("Visitante").getByText("Quitado", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Criar rateio", exact: true }).click();
    await expect(page.getByLabel("Evento relacionado (opcional)")).toHaveValue(event.id);
    await page.getByLabel("Título", { exact: true }).fill("Almoço de sábado");
    await page.getByLabel("Aplicação do rateio").selectOption("DAY");
    await page.getByLabel("Dia da despesa").selectOption("2026-11-21");
    const members = page.getByRole("group", { name: /Participantes/ });
    await expect(members.getByLabel("Urias", { exact: true })).not.toBeChecked();
    await expect(members.getByLabel("Visitante", { exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Criar rateio", exact: true }).click();
    await expect(page).toHaveURL(/\/cost-shares\/[0-9a-f-]+$/);
    await page.getByLabel("Item", { exact: true }).fill("Compras do almoço");
    await page.getByLabel("Valor", { exact: true }).fill("90");
    await page.getByLabel("Quem pagou").selectOption(users[2].id);
    await page.getByRole("button", { name: "Adicionar compra", exact: true }).click();
    await expect(
      page.getByText("Compra adicionada e rateio recalculado.", { exact: true }),
    ).toBeVisible();
    await page.goto(eventUrl);
    await expect(person("Luiz").locator(".account-due")).toContainText("530,00");
    await expect(person("Kelvin").locator(".account-due")).toContainText("530,00");
    await expect(person("Urias").locator(".account-due")).toContainText("110,00");
    await expect(person("Visitante").locator(".account-due")).toContainText("30,00");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath("conta-por-noites-mobile.png"),
      fullPage: true,
    });
    for (const user of users) {
      await person(user.name)
        .getByRole("button", { name: "Registrar pagamento", exact: true })
        .click();
      await person(user.name)
        .getByRole("button", { name: "Confirmar registro", exact: true })
        .click();
      await expect(person(user.name).getByText("Quitado", { exact: true })).toBeVisible();
    }
    page.on("dialog", (dialog) => dialog.accept());
    await account.getByRole("button", { name: "Fechar conta do evento", exact: true }).click();
    await expect(account.getByText("Conta do evento fechada.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(
      billing.getByText("Divisão preservada no fechamento. Reabra a conta para alterar.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      billing.getByText("Configurar divisão e participantes", { exact: true }),
    ).toHaveCount(0);
    await account.getByRole("button", { name: "Reabrir conta", exact: true }).click();
    await expect(account.getByText("Conta reaberta e recalculada.", { exact: true })).toBeVisible();
    await billing.getByText("Configurar divisão e participantes", { exact: true }).click();
    await billing.getByLabel("Como dividir o custo").selectOption("DAY");
    await expect(billing.locator(".billing-periods fieldset")).toHaveCount(3);
    expect(errors).toEqual([]);
  } finally {
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await db.$disconnect();
  }
});
