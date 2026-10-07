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
  },
  busy: Interval[],
  now = new Date(),
): Date[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    duration <= 0 ||
    !config.workingDays.includes(new Date(date + "T12:00:00Z").getUTCDay())
  )
    return [];
  const start = fromZonedTime(`${date}T${config.open}:00`, config.timezone);
  const end = fromZonedTime(`${date}T${config.close}:00`, config.timezone);
  const result: Date[] = [];
  for (
    let t = start.getTime();
    t + duration * 60000 <= end.getTime();
    t += 15 * 60000
  ) {
    if (
      t > now.getTime() &&
      !busy.some(
        (b) => t < b.end.getTime() && t + duration * 60000 > b.start.getTime(),
      )
    )
      result.push(new Date(t));
  }
  return result;
}
