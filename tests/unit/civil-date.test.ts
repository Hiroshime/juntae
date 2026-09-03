import { describe, expect, it } from "vitest";
import {
  addCivilMonths,
  civilMonthRange,
  civilDateRange,
  dateTimeLocalInTimeZone,
  utcRangeForCivilDate,
  zonedDateTimeToUtc,
} from "@/lib/dates/civil-date";

describe("civil dates and timezones", () => {
  it("resolve meses civis, incluindo ano bissexto e virada de ano", () => {
    expect(civilMonthRange("2028-02")).toEqual({
      startDate: "2028-02-01",
      endDate: "2028-02-29",
    });
    expect(addCivilMonths("2026-12", 1)).toBe("2027-01");
    expect(addCivilMonths("2027-01", -1)).toBe("2026-12");
    expect(() => civilMonthRange("2026-13")).toThrow("Mês civil inválido");
  });

  it("inclui fevereiro bissexto e atravessa o mês", () => {
    expect(civilDateRange("2028-02-28", "2028-03-01")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("converte meia-noite de São Paulo para UTC", () => {
    expect(zonedDateTimeToUtc("2026-09-01", "00:00", "America/Sao_Paulo").toISOString()).toBe(
      "2026-09-01T03:00:00.000Z",
    );
  });

  it("considera horário de verão do timezone informado", () => {
    expect(zonedDateTimeToUtc("2026-07-01", "00:00", "America/New_York").toISOString()).toBe(
      "2026-07-01T04:00:00.000Z",
    );
    expect(zonedDateTimeToUtc("2026-01-01", "00:00", "America/New_York").toISOString()).toBe(
      "2026-01-01T05:00:00.000Z",
    );
  });

  it("delimita o período noturno até a meia-noite seguinte", () => {
    const range = utcRangeForCivilDate("2026-09-01", "America/Sao_Paulo", "EVENING");
    expect(range.start.toISOString()).toBe("2026-09-01T21:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-02T03:00:00.000Z");
  });

  it("formata a data UTC para edição no timezone do evento", () => {
    expect(dateTimeLocalInTimeZone(new Date("2026-09-01T22:30:00.000Z"), "America/Sao_Paulo")).toBe(
      "2026-09-01T19:30",
    );
  });
});
