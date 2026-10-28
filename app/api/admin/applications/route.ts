import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const deleteRequestSchema = z.union([
  z.object({
    applicationIds: z.array(z.string().cuid()).min(1).max(500).refine((ids) => new Set(ids).size === ids.length),
  }).strict(),
  z.object({ batchId: z.string().cuid() }).strict(),
]);

export async function DELETE(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid deletion request." }, { status: 400 });
  }

  const parsed = deleteRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Invalid deletion request." }, { status: 400 });

  const applicationIds = "applicationIds" in parsed.data ? parsed.data.applicationIds : undefined;
  const batchId = "batchId" in parsed.data ? parsed.data.batchId : undefined;

  try {
    const deletion = await db.$transaction(async (tx) => {
      let batchIdentifier: string | undefined;
      if (batchId) {
        const batch = await tx.batch.findUnique({ where: { id: batchId }, select: { id: true, identifier: true } });
        if (!batch) return { notFound: true as const };
        batchIdentifier = batch.identifier;
      }

      const applications = await tx.application.findMany({
        where: applicationIds ? { id: { in: applicationIds } } : { batchId },
        select: {
          id: true,
          studentId: true,
          batchId: true,
          seatStatus: true,
          batch: { select: { capacity: true, reservedSeats: true, status: true } },
        },
      });

      if (applicationIds && applications.length !== applicationIds.length) return { notFound: true as const };

      const reservationsByBatch = new Map<string, { count: number; reservedSeats: number; capacity: number; status: string }>();
      for (const application of applications) {
        if (application.seatStatus !== "RESERVED") continue;
        const current = reservationsByBatch.get(application.batchId);
        reservationsByBatch.set(application.batchId, {
          count: (current?.count || 0) + 1,
          reservedSeats: application.batch.reservedSeats,
          capacity: application.batch.capacity,
          status: application.batch.status,
        });
      }

      for (const [id, reservation] of reservationsByBatch) {
        const reopenBatch = reservation.status === "FULL" && reservation.reservedSeats - reservation.count < reservation.capacity;
        const updated = await tx.batch.updateMany({
          where: { id, reservedSeats: { gte: reservation.count } },
          data: {
            reservedSeats: { decrement: reservation.count },
            ...(reopenBatch ? { status: "OPEN" as const } : {}),
          },
        });
        if (updated.count !== 1) throw new Error("BATCH_SEAT_COUNT_INCONSISTENT");
      }

      const releasedApplications = applications.filter((application) => application.seatStatus === "RESERVED");
      if (releasedApplications.length > 0) {
        await tx.auditLog.createMany({
          data: releasedApplications.map((application) => ({
            userId: admin.id,
            action: "SEAT_RELEASED",
            entity: "Application",
            entityId: application.id,
            metadata: { batchId: application.batchId, reason: "Applications deleted by admin" },
          })),
        });
      }

      if (applications.length > 0) {
        const removed = await tx.application.deleteMany({ where: { id: { in: applications.map((application) => application.id) } } });
        if (removed.count !== applications.length) throw new Error("APPLICATIONS_CHANGED");
      }

      const studentIds = [...new Set(applications.map((application) => application.studentId))];
      const studentsDeleted = studentIds.length > 0
        ? (await tx.student.deleteMany({ where: { id: { in: studentIds }, applications: { none: {} } } })).count
        : 0;

      if (batchId) await tx.batch.delete({ where: { id: batchId } });

      return { notFound: false as const, applicationsDeleted: applications.length, studentsDeleted, batchDeleted: Boolean(batchId), batchIdentifier };
    }, { isolationLevel: "Serializable" });

    if (deletion.notFound) return NextResponse.json({ message: "One or more applications or the selected batch were not found." }, { status: 404 });

    revalidatePath("/admin/applications");
    revalidatePath("/admin/students");
    revalidatePath("/admin/batches");
    revalidatePath("/admin");
    revalidatePath("/training");

    return NextResponse.json({
      message: deletion.batchDeleted
        ? `Batch ${deletion.batchIdentifier} and its applications were permanently deleted.`
        : "Selected student applications deleted successfully.",
      applicationsDeleted: deletion.applicationsDeleted,
      studentsDeleted: deletion.studentsDeleted,
      batchDeleted: deletion.batchDeleted,
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return NextResponse.json({ message: "The applications changed while being deleted. Refresh and try again." }, { status: 409 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
      return NextResponse.json({ message: "Some applications are linked to other records and could not be deleted." }, { status: 409 });
    }
    return NextResponse.json({ message: "The applications could not be deleted. Please try again." }, { status: 500 });
  }
}