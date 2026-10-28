"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createPaymentAccessToken, paymentAccessCookieName } from "@/lib/payment-access";
import { db } from "@/lib/db";
import { isPublicBatchEligible } from "@/lib/batch-eligibility";
import { admissionSchema } from "@/lib/validations/admission";

export type AdmissionResult =
  | { ok: true; name: string; applicationId: string; batchId: string; courseName: string; fee: string | null }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function submitAdmission(formData: FormData): Promise<AdmissionResult> {
  const parsed = admissionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { ok: false, message: fieldErrors.batchId?.[0] || "Please review the highlighted fields.", fieldErrors };
  }

  const input = parsed.data;
  const paymentAccess = createPaymentAccessToken();
  try {
    const result = await reserveAdmission(input, paymentAccess.hash);
    await (await cookies()).set(paymentAccessCookieName(result.applicationId), paymentAccess.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/admission",
      maxAge: 60 * 60 * 24 * 30,
    });

    revalidatePath("/");
    revalidatePath("/training");
    revalidatePath("/admission");
    return { ok: true, ...result };
  } catch (error) {
    if (isSerializationFailure(error)) {
      try {
        const result = await reserveAdmission(input, paymentAccess.hash);
        await (await cookies()).set(paymentAccessCookieName(result.applicationId), paymentAccess.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/admission",
          maxAge: 60 * 60 * 24 * 30,
        });
        revalidatePath("/");
        revalidatePath("/training");
        revalidatePath("/admission");
        return { ok: true, ...result };
      } catch (retryError) {
        error = retryError;
      }
    }
    const code = error instanceof Error ? error.message : "";
    if (code === "BATCH_FULL") return { ok: false, message: "That training slot filled just before your application. Please choose another slot." };
    if (code === "BATCH_UNAVAILABLE") return { ok: false, message: "That training slot is no longer open." };
    if (code === "DUPLICATE_APPLICATION") return { ok: false, message: "An application already exists for this training slot." };
    return { ok: false, message: "We could not submit your application. Please try again." };
  }
}

async function reserveAdmission(input: {
  fullName: string;
  fatherName: string;
  phone: string;
  whatsapp: string;
  email: string;
  cnic?: string;
  education: string;
  occupation?: string;
  experience?: string;
  address?: string;
  notes?: string;
  batchId: string;
}, paymentTokenHash: string) {
    return db.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({ where: { id: input.batchId }, include: { course: true } });
      if (!batch || !isPublicBatchEligible(batch)) throw new Error("BATCH_UNAVAILABLE");

      const existingStudent = await tx.student.findFirst({
        where: { OR: [{ email: input.email }, { phone: input.phone }] },
      });
      if (existingStudent) {
        const existingApplication = await tx.application.findUnique({
          where: { studentId_batchId: { studentId: existingStudent.id, batchId: input.batchId } },
        });
        if (existingApplication) throw new Error("DUPLICATE_APPLICATION");
      }

      const reservation = await tx.batch.updateMany({
        where: { id: input.batchId, status: "OPEN", reservedSeats: { lt: batch.capacity }, course: { active: true } },
        data: { reservedSeats: { increment: 1 } },
      });
      if (reservation.count !== 1) throw new Error("BATCH_FULL");

      const student = existingStudent ?? await tx.student.create({
        data: { fullName: input.fullName, fatherName: input.fatherName, phone: input.phone, whatsapp: input.whatsapp, email: input.email, cnic: input.cnic || null, education: input.education, occupation: input.occupation || null, experience: input.experience || null, address: input.address || null },
      });
      const application = await tx.application.create({ data: { studentId: student.id, batchId: batch.id, notes: input.notes || null } });
      await tx.payment.create({ data: { applicationId: application.id, expectedAmount: batch.course.fee, studentTokenHash: paymentTokenHash } });
      if (batch.reservedSeats + 1 >= batch.capacity) await tx.batch.update({ where: { id: batch.id }, data: { status: "FULL" } });
      return { name: student.fullName, applicationId: application.id, batchId: batch.id, courseName: batch.course.name, fee: batch.course.fee?.toString() ?? null };
    }, { isolationLevel: "Serializable" });
}

function isSerializationFailure(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
