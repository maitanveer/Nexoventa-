"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { matchesPaymentAccessToken, paymentAccessCookieName } from "@/lib/payment-access";
import { assertPaymentBucketIsPrivate } from "@/lib/payment-storage";

const maxReceiptSize = 2 * 1024 * 1024;
const paymentMethods = ["BANK_TRANSFER", "SADAPAY"] as const;
const methodLabels = {
  BANK_TRANSFER: "Bank Transfer (UBL)",
  SADAPAY: "SadaPay",
} as const;

export type PaymentSubmissionResult = { ok: true; amount: string } | { ok: false; message: string };

export async function clearVerifiedPaymentAccess(formData: FormData) {
  const parsed = z.string().cuid().safeParse(formData.get("applicationId"));
  if (!parsed.success) return;
  const cookieStore = await cookies();
  const cookieName = paymentAccessCookieName(parsed.data);
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return;
  const payment = await db.payment.findUnique({ where: { applicationId: parsed.data }, include: { application: true } });
  if (!payment || payment.status !== "VERIFIED" || payment.application.status !== "CONFIRMED" || !matchesPaymentAccessToken(token, payment.studentTokenHash)) return;
  cookieStore.set(cookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/admission", maxAge: 0 });
  revalidatePath("/admission");
}

const paymentFieldsSchema = z.object({
  applicationId: z.string().cuid(),
  method: z.enum(paymentMethods),
  transactionReference: z.string().trim().min(3).max(100),
  amount: z.string().trim().regex(/^\d{1,8}(?:\.\d{1,2})?$/, "Enter an amount with up to two decimal places.").refine((value) => Number(value) >= 8000, "The minimum initial payment is PKR 8,000."),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function submitPaymentReceipt(formData: FormData): Promise<PaymentSubmissionResult> {
  const parsed = paymentFieldsSchema.safeParse({
    applicationId: formData.get("applicationId"),
    method: formData.get("method"),
    transactionReference: formData.get("transactionReference"),
    amount: formData.get("amount"),
    paymentDate: formData.get("paymentDate"),
  });
  if (!parsed.success) {
    const amountError = parsed.error.issues.find((issue) => issue.path[0] === "amount");
    return { ok: false, message: amountError?.message || "Check the payment details and try again." };
  }

  const { applicationId, method, transactionReference, amount, paymentDate } = parsed.data;
  const paidOn = new Date(`${paymentDate}T00:00:00.000Z`);
  if (Number.isNaN(paidOn.getTime()) || paidOn.toISOString().slice(0, 10) !== paymentDate || paidOn > new Date()) {
    return { ok: false, message: "Enter a valid payment date that is not in the future." };
  }

  const receipt = formData.get("receipt");
  if (!(receipt instanceof File) || receipt.size < 1 || receipt.size > maxReceiptSize) {
    return { ok: false, message: "Choose a JPEG, PNG, or WebP receipt image up to 2 MB." };
  }

  const signature = await getImageSignature(receipt);
  if (!signature || signature.mimeType !== receipt.type) {
    return { ok: false, message: "The receipt must be a valid JPEG, PNG, or WebP image." };
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(paymentAccessCookieName(applicationId))?.value;
  if (!accessToken) return { ok: false, message: "This application session has expired. Contact admissions to continue." };

  const payment = await db.payment.findUnique({
    where: { applicationId },
    include: { application: { include: { batch: { include: { course: true } } } } },
  });
  if (!payment || !matchesPaymentAccessToken(accessToken, payment.studentTokenHash)) {
    return { ok: false, message: "This application session is not valid." };
  }
  if (!["NOT_SUBMITTED", "REJECTED"].includes(payment.status) || payment.application.status !== "PENDING") {
    return { ok: false, message: "This application is not accepting another payment submission." };
  }
  if (!payment.expectedAmount) return { ok: false, message: "The course fee has not been configured. Please contact admissions before paying." };
  const numericAmount = Number(amount);
  if (numericAmount < 8000) return { ok: false, message: "The minimum initial payment is PKR 8,000." };
  if (numericAmount > Number(payment.expectedAmount)) return { ok: false, message: `The submitted amount cannot exceed the full course fee of PKR ${payment.expectedAmount.toString()}.` };

  const instructions = process.env[`PAYMENT_INSTRUCTIONS_${method}`]?.trim();
  if (!instructions) return { ok: false, message: `Payment instructions for ${methodLabels[method]} are not configured. Please contact admissions before paying.` };

  let storage: Awaited<ReturnType<typeof assertPaymentBucketIsPrivate>>;
  try {
    storage = await assertPaymentBucketIsPrivate();
  } catch (error) {
    return { ok: false, message: storageErrorMessage(error) };
  }

  const receiptPath = `${applicationId}/${randomUUID()}.${signature.extension}`;
  const { error: uploadError } = await storage.upload(receiptPath, Buffer.from(await receipt.arrayBuffer()), {
    contentType: signature.mimeType,
    upsert: false,
  });
  if (uploadError) return { ok: false, message: "Receipt storage is unavailable. Please try again later." };

  const normalizedReference = transactionReference.trim().replace(/\s+/g, " ").toUpperCase();
  const previousReceiptPath = payment.receiptPath;
  try {
    const updated = await db.payment.updateMany({
      where: { id: payment.id, status: { in: ["NOT_SUBMITTED", "REJECTED"] } },
      data: {
        status: "PENDING_VERIFICATION",
        method,
        amount,
        transactionReference: transactionReference.trim(),
        normalizedTransactionReference: normalizedReference,
        paymentDate: paidOn,
        receiptPath,
        submittedAt: new Date(),
        reviewedAt: null,
        verifiedAt: null,
        reviewedById: null,
        rejectionReason: null,
      },
    });
    if (updated.count !== 1) {
      await storage.remove([receiptPath]);
      return { ok: false, message: "This payment has already been submitted. Refresh the page to see its status." };
    }
  } catch (error) {
    await storage.remove([receiptPath]);
    if (isUniqueConstraintError(error)) return { ok: false, message: "That transaction reference is already associated with a payment." };
    return { ok: false, message: "We could not submit the payment for review. Please try again." };
  }

  if (previousReceiptPath) await storage.remove([previousReceiptPath]);
  revalidatePath("/admission");
  revalidatePath("/admin");
  revalidatePath("/admin/applications");
  return { ok: true, amount };
}

async function getImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: "image/jpeg", extension: "jpg" };
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return { mimeType: "image/png", extension: "png" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mimeType: "image/webp", extension: "webp" };
  return null;
}

function storageErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "PAYMENT_STORAGE_NOT_CONFIGURED") return "Receipt storage credentials are missing or invalid. Please contact admissions.";
  if (error instanceof Error && error.message === "PAYMENT_BUCKET_MUST_BE_PRIVATE") return "Receipt storage is misconfigured. Please contact admissions.";
  return "Receipt storage credentials are invalid or the private payment-receipts bucket is unavailable. Please contact admissions.";
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}