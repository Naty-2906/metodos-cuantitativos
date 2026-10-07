import { db } from "./db";
// Shared database-backed buckets work across serverless instances; no spoofable IP headers.
export async function allowRequest(
  key: string,
  limit: number,
  seconds: number,
) {
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" ("key","count","window") VALUES (${key},1,NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimit"."window" < NOW() - make_interval(secs => ${seconds}) THEN 1 ELSE "RateLimit"."count"+1 END, "window"=CASE WHEN "RateLimit"."window" < NOW() - make_interval(secs => ${seconds}) THEN NOW() ELSE "RateLimit"."window" END RETURNING "count"`;
  return rows[0].count <= limit;
}
