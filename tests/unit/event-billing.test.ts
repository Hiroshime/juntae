import { describe, expect, it } from "vitest";
import { billingSelectionSchema } from "@/lib/validation/event-billing";
import { eventSchema } from "@/lib/validation/event";
import {
  allocateByPeriods,
  billingDates,
  resolveEventBilling,
  type BillingEvent,
} from "@/server/domain/event-billing";
import { calculateEventAccount, eventAccountSummarySchema } from "@/server/domain/event-account";
import { calculateCostShare } from "@/server/domain/cost-shares";

const ids = [1, 2, 3].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const people = ids.map((id, n) => ({ id, name: ["Luiz", "Kelvin", "Urias"][n] }));
const event: BillingEvent = {
  startsAt: new Date("2026-11-20T18:00:00Z"),
  endsAt: new Date("2026-11-22T15:00:00Z"),
  allDay: false,
  timezone: "America/Sao_Paulo",
  billingMode: "NIGHT",
  billingParticipants: null,
  rsvps: people.map((person) => ({
    userId: person.id,
    user: { ...person, memberships: [] },
    attendingSpecificDays: false,
    attendanceDays: [],
  })),
};
const periods = [
  { date: "2026-11-20", label: "Primeira noite", participants: people },
  { date: "2026-11-21", label: "Segunda noite", participants: people.slice(0, 2) },
];

describe("divisão por períodos", () => {
  it("conta três dias e duas noites, incluindo eventos de dia inteiro", () => {
    expect(billingDates(event, "DAY")).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(billingDates(event, "NIGHT")).toEqual(["2026-11-20", "2026-11-21"]);
    const allDay = {
      ...event,
      allDay: true,
      startsAt: new Date("2026-11-20T03:00:00Z"),
      endsAt: new Date("2026-11-23T03:00:00Z"),
    };
    expect(billingDates(allDay, "DAY")).toHaveLength(3);
    expect(billingDates(allDay, "NIGHT")).toHaveLength(2);
    const midnight = { ...event, endsAt: new Date("2026-11-22T03:00:00Z") };
    expect(billingDates(midnight, "DAY")).toHaveLength(2);
    expect(billingDates(midnight, "NIGHT")).toHaveLength(2);
  });
  it("usa datas civis em vez de blocos de 24 horas no horário de verão", () => {
    const dst = {
      ...event,
      timezone: "America/New_York",
      startsAt: new Date("2026-03-07T20:00:00Z"),
      endsAt: new Date("2026-03-09T15:00:00Z"),
    };
    expect(billingDates(dst, "NIGHT")).toEqual(["2026-03-07", "2026-03-08"]);
    expect(billingDates(dst, "DAY")).toHaveLength(3);
    expect(billingDates({ ...event, endsAt: null }, "NIGHT")).toEqual([]);
    expect(() => billingDates({ ...event, endsAt: new Date("2028-11-22") }, "DAY")).toThrow(
      "BILLING_PERIOD_TOO_LONG",
    );
  });
  it("divide o custo de cada noite e resulta em 500/500/200", () => {
    const result = allocateByPeriods(120_000, periods);
    expect([...result.charges.values()]).toEqual([50_000, 50_000, 20_000]);
    expect(result.unallocatedCents).toBe(0);
    expect(result.breakdown.map((period) => period.amountCents)).toEqual([60_000, 60_000]);
    const ledger = calculateEventAccount({
      currency: "BRL",
      eventCostCents: 120_000,
      confirmed: people,
      billing: { mode: "NIGHT", periods, issues: [] },
      shares: [],
      payments: [],
    });
    expect(ledger.summary.people.map((person) => person.eventShareCents).sort()).toEqual([
      20_000, 50_000, 50_000,
    ]);
    expect(ledger.issues).toEqual([]);
  });
  it("preserva centavos em duas etapas e aponta o custo de períodos vazios", () => {
    for (let total = 0; total < 100; total++) {
      const value = allocateByPeriods(total, periods);
      expect([...value.charges.values()].reduce((a, b) => a + b, 0)).toBe(total);
      expect(value.breakdown.reduce((sum, period) => sum + period.amountCents, 0)).toBe(total);
    }
    const empty = allocateByPeriods(101, [periods[0], { ...periods[1], participants: [] }]);
    expect(empty.unallocatedCents).toBe(50);
    expect(empty.issues).toHaveLength(1);
    expect([...empty.charges.values()].reduce((a, b) => a + b, 0) + empty.unallocatedCents).toBe(
      101,
    );
    expect(allocateByPeriods(100, []).unallocatedCents).toBe(100);
    expect(() =>
      allocateByPeriods(100, [{ ...periods[0], participants: [people[0], people[0]] }]),
    ).toThrow("INVALID_ALLOCATION");
  });
  it("não deduz pernoite da presença parcial e exige a revisão da organização", () => {
    const partial = {
      ...event,
      rsvps: event.rsvps.map((rsvp, index) =>
        index === 2
          ? {
              ...rsvp,
              attendingSpecificDays: true,
              attendanceDays: [{ date: new Date("2026-11-20") }, { date: new Date("2026-11-21") }],
            }
          : rsvp,
      ),
    };
    const night = resolveEventBilling(partial);
    expect(night.issues.join(" ")).toContain("presença parcial");
    expect(
      night.periods.every((period) => !period.participants.some((person) => person.id === ids[2])),
    ).toBe(true);
    expect(
      resolveEventBilling({ ...partial, billingMode: "DAY" }).periods.map(
        (period) => period.participants.length,
      ),
    ).toEqual([3, 3, 2]);
    const reviewed = resolveEventBilling({
      ...partial,
      billingParticipants: {
        mode: "NIGHT",
        periods: periods.map((period) => ({
          date: period.date,
          userIds: period.participants.map((person) => person.id),
        })),
      },
    });
    expect(reviewed.issues).toEqual([]);
    expect(reviewed.periods.map((period) => period.participants.length)).toEqual([3, 2]);
  });
  it("sinaliza seleção desatualizada e mantém pagador fora da cota", () => {
    const stale = resolveEventBilling({
      ...event,
      billingParticipants: { mode: "NIGHT", periods: [] },
    });
    expect(stale.issues.join(" ")).toContain("datas do evento mudaram");
    const payer = { id: "pagador", name: "Visitante" };
    const result = calculateCostShare(
      people.slice(0, 1),
      [{ payerId: payer.id, amountCents: 500 }],
      { payers: [payer], charges: new Map([[ids[0], 500]]), allowSingle: true },
    );
    expect(result.balances.find((person) => person.id === payer.id)).toMatchObject({
      paidCents: 500,
      shareCents: 0,
      balanceCents: 500,
    });
    expect(result.balances.reduce((sum, person) => sum + person.balanceCents, 0)).toBe(0);
  });
  it("aceita snapshots anteriores sem campos de divisão e valida seleção externa", () => {
    const snapshot = calculateEventAccount({
      currency: "BRL",
      eventCostCents: 100,
      confirmed: people,
      shares: [],
      payments: [],
    }).summary;
    const old: Record<string, unknown> = { ...snapshot };
    delete old.billingMode;
    delete old.periods;
    delete old.unallocatedCents;
    expect(eventAccountSummarySchema.parse(old)).toMatchObject({
      billingMode: "EQUAL",
      periods: [],
      unallocatedCents: 0,
    });
    expect(
      billingSelectionSchema.safeParse({
        mode: "NIGHT",
        periods: [{ date: "2026-11-20", userIds: [ids[0], ids[0]] }],
      }).success,
    ).toBe(false);
    expect(
      billingSelectionSchema.safeParse({
        mode: "DAY",
        periods: [{ date: "2026-02-30", userIds: [] }],
      }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        title: "Teste",
        description: "",
        startsAt: event.startsAt.toISOString(),
        endsAt: event.startsAt.toISOString(),
        allDay: false,
        timezone: event.timezone,
        locationName: "",
        locationAddress: "",
        locationUrl: "",
        estimatedCost: 100,
        currency: "BRL",
        billingMode: "NIGHT",
      }).success,
    ).toBe(false);
  });
});
