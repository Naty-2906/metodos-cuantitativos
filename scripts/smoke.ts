import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
const base = process.env.APP_ORIGIN!;
const ids: string[] = [];
let cookie = "";
async function post(body: unknown, auth = false) {
  return fetch(base + "/api/" + (auth ? "admin" : "book"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function main() {
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/api/admin")).status, 401);
  const catalog = await (await fetch(base + "/api/public")).json();
  assert.equal(catalog.services.length, 3);
  let start = "",
    date = "";
  for (let i = 1; i < 8 && !start; i++) {
    date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    const d = await (
      await fetch(
        `${base}/api/public?date=${date}&service=${catalog.services[0].id}`,
      )
    ).json();
    start = d.slots[0] ?? "";
  }
  assert.ok(start);
  const body = {
    serviceId: catalog.services[0].id,
    start,
    name: "Smoke Test",
    phone: "+56912345678",
    email: "smoke@example.com",
  };
  const responses = await Promise.all([post(body), post(body)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  for (const response of responses) {
    const d = await response.json();
    if (d.id) ids.push(d.id);
  }
  const login = await post(
    { action: "login", password: process.env.ADMIN_PASSWORD },
    true,
  );
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await fetch(base + "/api/admin", { headers: { cookie } })).status,
    200,
  );
  assert.equal(
    (
      await post(
        {
          action: "block",
          start,
          end: new Date(new Date(start).getTime() + 60000).toISOString(),
          reason: "Smoke",
        },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        { action: "status", id: ids[0], status: "CANCELLED", method: "CASH" },
        true,
      )
    ).status,
    200,
  );
  const free = await (
    await fetch(
      `${base}/api/public?date=${date}&service=${catalog.services[0].id}`,
    )
  ).json();
  assert.ok(free.slots.includes(start));
  const a = await db.appointment.create({
    data: {
      serviceId: catalog.services[0].id,
      start: new Date("2020-01-02T10:00Z"),
      end: new Date("2020-01-02T10:30Z"),
      price: 1500,
      name: "Smoke History",
      phone: "12345678",
      email: "smoke@example.com",
    },
  });
  ids.push(a.id);
  assert.equal(
    (
      await post(
        { action: "status", id: a.id, status: "COMPLETED", method: "CASH" },
        true,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await post(
        { action: "status", id: a.id, status: "COMPLETED", method: "CASH" },
        true,
      )
    ).status,
    400,
  );
  assert.equal(await db.payment.count({ where: { appointmentId: a.id } }), 1);
  console.log(
    "PASS: public page, catalog, admin protection, concurrent booking, conflicting break, cancellation and idempotent completion/payment.",
  );
}
main().finally(async () => {
  await db.payment.deleteMany({ where: { appointmentId: { in: ids } } });
  await db.appointment.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
