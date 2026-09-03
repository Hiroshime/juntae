import { z } from "zod";
import { daysBetweenCivilDates, parseCivilDate } from "@/lib/dates/civil-date";

const civilDate = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return true;
  } catch {
    return false;
  }
}, "Informe uma data válida.");

const nullableCivilDate = z
  .union([civilDate, z.literal(""), z.null()])
  .transform((value) => (value ? value : null));

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const timezone = z.string().max(64).refine(isIanaTimezone, "Informe um timezone IANA válido.");
const editableAvailabilityStatus = z.enum([
  "AVAILABLE",
  "PARTIALLY_AVAILABLE",
  "WORKING",
  "DAY_OFF",
  "VACATION",
  "UNAVAILABLE",
]);

const allDayOverrideSchema = z
  .object({
    allDay: z.literal(true),
    startDate: civilDate,
    endDate: civilDate,
    timezone,
    status: editableAvailabilityStatus,
    note: z.string().trim().max(500, "A observação é muito longa.").nullable().default(null),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "A data final deve ser igual ou posterior à inicial.",
    path: ["endDate"],
  })
  .refine((value) => daysBetweenCivilDates(value.startDate, value.endDate) <= 366, {
    message: "Um registro pode cobrir no máximo 367 dias.",
    path: ["endDate"],
  });

const timedOverrideSchema = z
  .object({
    allDay: z.literal(false),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    status: editableAvailabilityStatus,
    note: z.string().trim().max(500, "A observação é muito longa.").nullable().default(null),
  })
  .refine((value) => new Date(value.endAt) > new Date(value.startAt), {
    message: "O horário final deve ser posterior ao inicial.",
    path: ["endAt"],
  })
  .refine(
    (value) =>
      new Date(value.endAt).getTime() - new Date(value.startAt).getTime() <= 366 * 86_400_000,
    { message: "Um registro pode cobrir no máximo 366 dias.", path: ["endAt"] },
  );

export const availabilityOverrideSchema = z.discriminatedUnion("allDay", [
  allDayOverrideSchema,
  timedOverrideSchema,
]);

const scheduleDayStatus = z.enum(["WORKING", "DAY_OFF"]);
const weeklyPatternSchema = z.object({
  sunday: scheduleDayStatus,
  monday: scheduleDayStatus,
  tuesday: scheduleDayStatus,
  wednesday: scheduleDayStatus,
  thursday: scheduleDayStatus,
  friday: scheduleDayStatus,
  saturday: scheduleDayStatus,
});

const scheduleBase = z.object({
  name: z.string().trim().min(2, "Informe um nome para a escala.").max(120),
  startDate: civilDate,
  endDate: nullableCivilDate,
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const weeklyScheduleSchema = scheduleBase.extend({
  ruleType: z.literal("WEEKLY"),
  weeklyPattern: weeklyPatternSchema,
});

const cycleScheduleSchema = scheduleBase.extend({
  ruleType: z.literal("CYCLE"),
  anchorDate: civilDate,
  workDays: z.number().int().min(1).max(30),
  restDays: z.number().int().min(1).max(30),
});

export const scheduleRuleSchema = z
  .discriminatedUnion("ruleType", [weeklyScheduleSchema, cycleScheduleSchema])
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "A data final deve ser igual ou posterior à inicial.",
    path: ["endDate"],
  });

export const calendarQuerySchema = z
  .object({
    startDate: civilDate,
    endDate: civilDate,
    onlyWeekends: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .default(false),
    minPeople: z.coerce.number().int().min(0).max(10_000).default(0),
    periodOfDay: z.enum(["ALL", "MORNING", "AFTERNOON", "EVENING"]).default("ALL"),
    memberIds: z.array(z.string().uuid()).optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "A data final deve ser igual ou posterior à inicial.",
    path: ["endDate"],
  })
  .refine((value) => daysBetweenCivilDates(value.startDate, value.endDate) <= 92, {
    message: "Consulte no máximo 93 dias por vez.",
    path: ["endDate"],
  });

export const previewScheduleSchema = z
  .object({
    rule: scheduleRuleSchema,
    startDate: civilDate,
    endDate: civilDate,
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "A data final deve ser igual ou posterior à inicial.",
    path: ["endDate"],
  });

export type AvailabilityOverrideInput = z.infer<typeof availabilityOverrideSchema>;
export type ScheduleRuleInput = z.infer<typeof scheduleRuleSchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
