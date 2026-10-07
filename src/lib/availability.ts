import { rangesSchema, dateSchema } from "./schedule";
import { fromZonedTime } from "date-fns-tz";
export type Interval = { start: Date; end: Date };
export function slots(
  date: string,
  duration: number,
  config: {
    open: string;
    close: string;
    timezone: string;
    workingDays: number[];
    dailySchedule?: unknown;
  },
  busy: Interval[],
  now = new Date(),
): Date[] {
  if (
    !dateSchema.safeParse(date).success ||
    !Number.isInteger(duration) ||
    duration <= 0
  )
    return [];
  let ranges: { open: string; close: string }[];
  if (config.dailySchedule !== undefined) {
    const schedule = config.dailySchedule as Record<string, unknown>;
    const parsed = rangesSchema.safeParse(schedule?.[date] ?? []);
    if (!parsed.success) return [];
    ranges = parsed.data;
  } else {
    if (!config.workingDays.includes(new Date(date + "T12:00:00Z").getUTCDay()))
      return [];
    ranges = [{ open: config.open, close: config.close }];
  }
  const result: Date[] = [];
  for (const range of [...ranges].sort((a, b) =>
    a.open.localeCompare(b.open),
  )) {
    const start = fromZonedTime(`${date}T${range.open}:00`, config.timezone);
    const end = fromZonedTime(`${date}T${range.close}:00`, config.timezone);
    for (
      let t = start.getTime();
      t + duration * 60000 <= end.getTime();
      t += 15 * 60000
    ) {
      if (
        t > now.getTime() &&
        !busy.some(
          (b) =>
            t < b.end.getTime() && t + duration * 60000 > b.start.getTime(),
        )
      )
        result.push(new Date(t));
    }
  }
  return result;
}
