import { z } from "zod";
import { parseCivilDate } from "@/lib/dates/civil-date";

const civilDate = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return true;
  } catch {
    return false;
  }
}, "Informe uma data válida.");

export const holidaySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do feriado.").max(120),
  date: civilDate,
});

export type HolidayInput = z.infer<typeof holidaySchema>;
