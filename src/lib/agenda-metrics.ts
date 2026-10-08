import { fromZonedTime } from "date-fns-tz";
import type { ScheduleDates } from "./schedule";
export function agendaOccupancy({
  month,
  timezone,
  schedule,
  ready,
  open,
  close,
  workingDays,
  appointments,
  blocks,
}: {
  month: string;
  timezone: string;
  schedule: ScheduleDates;
  ready: boolean;
  open: string;
  close: string;
  workingDays: number[];
  appointments: { start: string; end: string; status: string }[];
  blocks: { start: string; end: string }[];
}) {
  const count = new Date(month + "-01T12:00:00Z");
  count.setUTCMonth(count.getUTCMonth() + 1);
  count.setUTCDate(0);
  let capacity = 0,
    occupied = 0;
  for (let n = 1; n <= count.getUTCDate(); n++) {
    const date = month + "-" + String(n).padStart(2, "0");
    const ranges = ready
      ? (schedule[date] ?? [])
      : workingDays.includes(new Date(date + "T12:00:00Z").getUTCDay())
        ? [{ open, close }]
        : [];
    for (const range of ranges) {
      const start = fromZonedTime(date + "T" + range.open, timezone).getTime(),
        end = fromZonedTime(date + "T" + range.close, timezone).getTime();
      const intersections = (list: { start: string; end: string }[]) =>
        list
          .map((a) => [
            Math.max(start, new Date(a.start).getTime()),
            Math.min(end, new Date(a.end).getTime()),
          ])
          .filter(([s, e]) => s < e)
          .sort((a, b) => a[0] - b[0]);
      const union = (list: number[][]) => {
        let total = 0,
          last = -Infinity;
        for (const [s, e] of list) {
          total += Math.max(0, e - Math.max(s, last));
          last = Math.max(last, e);
        }
        return total;
      };
      const blocked = union(intersections(blocks));
      capacity += end - start - blocked;
      occupied += union(
        intersections(
          appointments.filter((a) =>
            ["BOOKED", "COMPLETED"].includes(a.status),
          ),
        ),
      );
    }
  }
  return {
    capacityMinutes: capacity / 60000,
    occupiedMinutes: occupied / 60000,
    percentage: capacity > 0 ? (occupied / capacity) * 100 : 0,
  };
}
