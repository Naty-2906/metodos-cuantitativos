import { test } from "node:test";
import assert from "node:assert/strict";
import { slots } from "../src/lib/availability";
const config = {
  open: "10:00",
  close: "12:00",
  timezone: "UTC",
  workingDays: [1, 2, 3, 4, 5],
};
const now = new Date("2026-08-01T00:00:00Z");
test("service duration fits opening hours and permits touching boundaries", () => {
  const result = slots(
    "2026-08-03",
    30,
    config,
    [
      {
        start: new Date("2026-08-03T10:30Z"),
        end: new Date("2026-08-03T11:00Z"),
      },
    ],
    now,
  ).map((d) => d.toISOString().slice(11, 16));
  assert.deepEqual(result, ["10:00", "11:00", "11:15", "11:30"]);
});
test("closed days and oversized service have no availability", () => {
  assert.equal(slots("2026-08-02", 30, config, [], now).length, 0);
  assert.equal(slots("2026-08-03", 180, config, [], now).length, 0);
});
test("past slots are excluded and breaks block full overlaps", () => {
  assert.deepEqual(
    slots(
      "2026-08-03",
      30,
      config,
      [
        {
          start: new Date("2026-08-03T11:00Z"),
          end: new Date("2026-08-03T12:00Z"),
        },
      ],
      new Date("2026-08-03T10:15Z"),
    ).map((d) => d.toISOString().slice(11, 16)),
    ["10:30"],
  );
});
test("business timezone determines UTC instant", () => {
  assert.equal(
    slots(
      "2026-08-03",
      30,
      { ...config, timezone: "America/Santiago" },
      [],
      now,
    )[0].toISOString(),
    "2026-08-03T14:00:00.000Z",
  );
});
