import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const parsedId = z.string().cuid().safeParse(id);
  if (!parsedId.success) return NextResponse.json({ message: "Invalid application ID." }, { status: 400 });

  try {
    const deleted = await db.$transaction(async (tx) => {
      const application = await tx.application.findUnique({
        where: { id: parsedId.data },
        select: {
          studentId: true,
          batchId: true,
          seatStatus: true,
          batch: { select: { capacity: true, status: true } },
        },
      });
      if (!application) return null;

      if (application.seatStatus === "RESERVED") {
        const releasedSeat = await tx.batch.updateMany({
          where: { id: application.batchId, reservedSeats: { gt: 0 } },
          data: { reservedSeats: { decrement: 1 } },
        });
        if (releasedSeat.count !== 1) throw new Error("SEAT_COUNT_INCONSISTENT");
        await tx.auditLog.create({
          data: { userId: admin.id, action: "SEAT_RELEASED", entity: "Application", entityId: parsedId.data, metadata: { batchId: application.batchId, reason: "Application deleted by admin" } },
        });

        if (application.batch.status === "FULL") {
          await tx.batch.updateMany({
            where: { id: application.batchId, status: "FULL", reservedSeats: { lt: application.batch.capacity } },
            data: { status: "OPEN" },
          });
        }
      }

      await tx.application.delete({ where: { id: parsedId.data } });
      const remainingApplications = await tx.application.count({ where: { studentId: application.studentId } });
      const studentDeleted = remainingApplications === 0
        ? (await tx.student.deleteMany({ where: { id: application.studentId, applications: { none: {} } } })).count === 1
        : false;

      return { batchId: application.batchId, studentDeleted };
    }, { isolationLevel: "Serializable" });

    if (!deleted) return NextResponse.json({ message: "Application not found." }, { status: 404 });

    revalidatePath("/admin/applications");
    revalidatePath("/admin/students");
    revalidatePath("/admin/batches");
    revalidatePath("/admin");
    revalidatePath("/training");

    return NextResponse.json({ message: "Student application deleted successfully.", ...deleted });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return NextResponse.json({ message: "The application changed while being deleted. Refresh and try again." }, { status: 409 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
      return NextResponse.json({ message: "The application is linked to other records and could not be deleted." }, { status: 409 });
    }
    return NextResponse.json({ message: "The application could not be deleted. Please try again." }, { status: 500 });
  }
}