import { test } from "node:test";
import assert from "node:assert/strict";
import { agendaOccupancy } from "../src/lib/agenda-metrics";
const base = {
  month: "2026-10",
  timezone: "America/Santiago",
  schedule: { "2026-10-07": [{ open: "10:00", close: "12:00" }] },
  ready: true,
  open: "10:00",
  close: "20:00",
  workingDays: [1, 2, 3, 4, 5],
  appointments: [],
  blocks: [],
};
test("occupancy uses published dated hours and ignores canceled visits", () => {
  const r = agendaOccupancy({
    ...base,
    appointments: [
      {
        start: "2026-10-07T13:00:00Z",
        end: "2026-10-07T13:30:00Z",
        status: "BOOKED",
      },
      {
        start: "2026-10-07T13:30:00Z",
        end: "2026-10-07T14:00:00Z",
        status: "CANCELLED",
      },
    ],
  });
  assert.equal(r.capacityMinutes, 120);
  assert.equal(r.occupiedMinutes, 30);
  assert.equal(r.percentage, 25);
});
test("overlapping rests are counted once and closed months have zero occupancy", () => {
  const r = agendaOccupancy({
    ...base,
    blocks: [
      { start: "2026-10-07T14:00:00Z", end: "2026-10-07T14:30:00Z" },
      { start: "2026-10-07T14:15:00Z", end: "2026-10-07T15:00:00Z" },
    ],
  });
  assert.equal(r.capacityMinutes, 60);
  assert.equal(agendaOccupancy({ ...base, schedule: {} }).percentage, 0);
});
