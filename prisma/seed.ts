import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting database seed...");

  // Create or update the Medical Billing course
  const course = await prisma.course.upsert({
    where: {
      slug: "medical-billing",
    },
    update: { fee: 18000 },
    create: {
      name: "Medical Billing",
      slug: "medical-billing",
      description:
        "Practical medical billing training with structured mentorship.",
      duration: "8 weeks",
      fee: 18000,
      active: true,
    },
  });

  console.log(`✅ Course ready: ${course.name}`);

  const batches = [
    [
      "SLOT-1",
      "2:00 PM",
      "3:00 PM",
      "Monday, Tuesday, Wednesday, Thursday, Friday",
    ],
    [
      "SLOT-2",
      "7:00 PM",
      "8:00 PM",
      "Monday, Tuesday, Wednesday, Thursday, Friday",
    ],
  ] as const;

  for (const [identifier, startTime, endTime, daysOfWeek] of batches) {
    await prisma.batch.upsert({
      where: {
        identifier,
      },
      update: {
        courseId: course.id,
        month: 9,
        year: 2026,
        startTime,
        endTime,
        daysOfWeek,
        capacity: 20,
        status: "OPEN",
      },
      create: {
        courseId: course.id,
        identifier,
        month: 9,
        year: 2026,
        daysOfWeek,
        startTime,
        endTime,
        capacity: 20,
        reservedSeats: 0,
        status: "OPEN",
      },
    });

    console.log(`✅ Batch ready: ${identifier}`);
  }

  for (const identifier of ["SLOT-0304", "SLOT-0405", "SLOT-0506", "SLOT-0607"]) {
    await prisma.batch.updateMany({
      where: { identifier },
      data: { status: "CLOSED" },
    });
    console.log(`✅ Historical batch preserved and closed: ${identifier}`);
  }

  // Create or update the September 2026 announcement
  await prisma.announcement.upsert({
    where: {
      slug: "september-2026-medical-billing-intake",
    },
    update: {
      title: "September 2026 Medical Billing Intake",
      content:
        "Applications are open for the September 2026 Medical Billing training slots.",
      published: true,
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    },
    create: {
      title: "September 2026 Medical Billing Intake",
      slug: "september-2026-medical-billing-intake",
      content:
        "Applications are open for the September 2026 Medical Billing training slots.",
      published: true,
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    },
  });

  console.log("✅ Announcement ready.");

  console.log("🎉 Database seed completed successfully!");
}

main()
  .catch((error) => {
    console.error(
      "❌ Seed failed:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });