import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test("conta do evento: habilitar, registrar parcelas e reembolso, fechar e reabrir", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  const suffix = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const users = await Promise.all(
    Array.from({ length: 10 }, async (_, index) =>
      db.user.create({
        data: {
          name: `Conta Pessoa ${index}`,
          email: `account-e2e-${index}-${suffix}@test.local`,
          passwordHash: await hash("senha-conta-e2e", 4),
        },
      }),
    ),
  );
  let communityId: string | undefined;
  try {
    const community = await db.community.create({
      data: {
        name: "Contas E2E",
        slug: `conta-${suffix}`,
        createdById: users[0].id,
        members: {
          create: users.map((user, index) => ({
            userId: user.id,
            role: index === 0 ? "OWNER" : "MEMBER",
          })),
        },
      },
    });
    communityId = community.id;
    const event = await db.event.create({
      data: {
        title: "Chácara do fim de semana",
        communityId,
        createdById: users[0].id,
        estimatedCost: 3000,
        startsAt: new Date("2026-11-20T12:00:00Z"),
        rsvps: { create: users.map((user) => ({ userId: user.id, status: "GOING" })) },
      },
    });
    for (const [index, amount] of [500, 300].entries())
      await db.costShare.create({
        data: {
          communityId,
          eventId: event.id,
          title: index ? "Pizza" : "Churrasco",
          createdById: users[0].id,
          participants: { create: users.map((user) => ({ userId: user.id })) },
          expenses: {
            create: {
              payerId: users[index].id,
              createdById: users[0].id,
              amount,
              description: "Compras do passeio",
              purchasedAt: new Date("2026-11-20"),
            },
          },
        },
      });
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(users[0].email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-conta-e2e");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app/);
    await page.goto(`/app/${community.slug}/events/${event.id}`);
    await page.getByRole("button", { name: "Habilitar controle de pagamentos" }).click();
    const account = page.locator("#conta");
    await expect(account.getByText("Controle de pagamentos habilitado.")).toBeVisible();
    const money = (value: string) => new RegExp(`R\\$\\s*${value}`);
    const person0 = account.getByRole("article", { name: "Conta de Conta Pessoa 0", exact: true });
    await expect(person0.locator(".account-due")).toContainText(money("120,00"));
    const person2 = account.getByRole("article", { name: "Conta de Conta Pessoa 2", exact: true });
    await expect(person2.locator(".account-due")).toContainText(money("380,00"));
    await expect(account.getByRole("button", { name: "Fechar conta do evento" })).toBeDisabled();
    await person2.getByRole("button", { name: "Registrar pagamento" }).click();
    await person2.getByLabel("Valor recebido").fill("100");
    await person2.getByRole("button", { name: "Confirmar registro" }).click();
    await expect(person2.locator(".account-due")).toContainText(money("280,00"));
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const [index] of users.entries()) {
      const person = account.getByRole("article", {
        name: `Conta de Conta Pessoa ${index}`,
        exact: true,
      });
      await person
        .getByRole("button", { name: index === 0 ? "Registrar reembolso" : "Registrar pagamento" })
        .click();
      await person.getByRole("button", { name: "Confirmar registro" }).click();
      await expect(person.getByText("Quitado", { exact: true })).toBeVisible();
    }
    await account.getByText("Histórico de pagamentos (11)").click();
    await expect(
      account.getByText("Registrado por Conta Pessoa 0", { exact: false }).first(),
    ).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept());
    await account.getByRole("button", { name: "Fechar conta do evento" }).click();
    await expect(account.getByText("Conta do evento fechada.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(account.getByText("Fechada", { exact: true })).toBeVisible();
    await account.getByRole("button", { name: "Reabrir conta" }).click();
    await expect(account.getByText("Conta reaberta e recalculada.")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (communityId) await db.community.delete({ where: { id: communityId } });
    await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await db.$disconnect();
  }
});
