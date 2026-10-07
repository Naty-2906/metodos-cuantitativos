import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
if (!existsSync(".env") && !process.env.DATABASE_URL) {
  const secret = () => randomBytes(32).toString("hex");
  writeFileSync(
    ".env",
    `DATABASE_URL="postgresql://postgres:${secret()}@localhost:5432/barber?schema=public"\nADMIN_PASSWORD="${secret()}"\nSESSION_SECRET="${secret()}"\nAPP_ORIGIN="http://localhost:3000"\n`,
    { mode: 0o600 },
  );
}
dotenv.config({ quiet: true });
if (!process.env.DATABASE_URL)
  throw Error("Configura DATABASE_URL antes de iniciar");
const url = new URL(process.env.DATABASE_URL);
if (["localhost", "127.0.0.1"].includes(url.hostname)) {
  const inspect = spawnSync("docker", ["inspect", "studio-barber-db"], {
    stdio: "ignore",
  });
  if (inspect.status === 0) {
    const r = spawnSync("docker", ["start", "studio-barber-db"], {
      stdio: "inherit",
    });
    if (r.status !== 0) throw Error("No se pudo iniciar PostgreSQL local");
  } else {
    const r = spawnSync(
      "docker",
      [
        "run",
        "--name",
        "studio-barber-db",
        "-e",
        "POSTGRES_PASSWORD",
        "-e",
        "POSTGRES_USER",
        "-e",
        "POSTGRES_DB",
        "-p",
        `127.0.0.1:${url.port || 5432}:5432`,
        "-v",
        "studio-barber-data:/var/lib/postgresql/data",
        "-d",
        "postgres:16-alpine",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          POSTGRES_PASSWORD: decodeURIComponent(url.password),
          POSTGRES_USER: decodeURIComponent(url.username),
          POSTGRES_DB: url.pathname.slice(1),
        },
      },
    );
    if (r.status !== 0) throw Error("No se pudo crear PostgreSQL local");
  }
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (
      spawnSync(
        "docker",
        [
          "exec",
          "studio-barber-db",
          "pg_isready",
          "-U",
          decodeURIComponent(url.username),
          "-d",
          url.pathname.slice(1),
        ],
        { stdio: "ignore" },
      ).status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw Error("PostgreSQL no respondió");
}
console.log("Configuración local preservada; PostgreSQL preparado.");
