import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { matchesPaymentAccessToken } from "@/lib/payment-access";

export async function getStudentPaymentApplication() {
  const accessCookies = (await cookies()).getAll().filter((cookie) => cookie.name.startsWith("nexoventa_payment_"));
  const applicationIds = accessCookies
    .map((cookie) => cookie.name.slice("nexoventa_payment_".length))
    .filter((id) => z.string().cuid().safeParse(id).success);
  if (applicationIds.length === 0) return null;

  const payments = await db.payment.findMany({
    where: { applicationId: { in: applicationIds }, application: { status: { in: ["PENDING", "CONFIRMED"] } } },
    include: { application: { include: { batch: { include: { course: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  const tokensByApplication = new Map(accessCookies.map((cookie) => [cookie.name.slice("nexoventa_payment_".length), cookie.value]));
  const payment = payments.find((item) => matchesPaymentAccessToken(tokensByApplication.get(item.applicationId) || "", item.studentTokenHash));
  if (!payment) return null;

  return {
    applicationId: payment.applicationId,
    courseName: payment.application.batch.course.name,
    batchIdentifier: payment.application.batch.identifier,
    fee: payment.expectedAmount?.toString() ?? null,
    status: payment.status,
    amount: payment.amount?.toString() ?? null,
    method: payment.method,
    transactionReference: payment.transactionReference,
    paymentDate: payment.paymentDate?.toISOString().slice(0, 10) ?? null,
    submittedAt: payment.submittedAt?.toISOString() ?? null,
    rejectionReason: payment.rejectionReason,
  };
}