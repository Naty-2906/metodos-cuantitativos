import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  await db.businessConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  if ((await db.service.count()) === 0)
    await db.service.createMany({
      data: [
        { name: "Corte clásico", duration: 30, price: 1500 },
        { name: "Perfilado de barba", duration: 20, price: 1000 },
        { name: "Corte + barba", duration: 50, price: 2200 },
      ],
    });
}
main().finally(() => db.$disconnect());
