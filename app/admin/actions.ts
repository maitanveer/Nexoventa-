"use server";

import { redirect } from "next/navigation";
import { clearAdminSession, createAdminSession, getAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export async function loginAdmin(formData: FormData) {
  const parsed = z.object({ email: z.string().trim().email(), password: z.string().min(1) }).safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/admin/login?error=invalid");
  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.role !== "ADMIN" || !verifyPassword(password, user.passwordHash)) redirect("/admin/login?error=invalid");
  await createAdminSession(user.id);
  redirect("/admin");
}

export async function logoutAdmin() {
  await clearAdminSession();
  redirect("/admin/login");
}

export async function updateApplicationStatus(formData: FormData) {
  const admin = await requireMutation();
  const returnTo = getApplicationReturnPath(formData.get("returnTo"));
  const parsed = z.object({ id: z.string().min(1), status: z.enum(["PENDING", "CANCELLED", "WAITLISTED"]) }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;

  const { id, status } = parsed.data;
  try {
    await db.$transaction(async (tx) => {
      const application = await tx.application.findUnique({ where: { id }, include: { batch: true, payment: true } });
      if (!application) return;

      const nextStatus = status;
      if (application.payment?.status === "VERIFIED" && nextStatus === "PENDING") throw new Error("VERIFIED_PAYMENT_CANNOT_BE_REOPENED");
      const releasing = application.seatStatus === "RESERVED" && nextStatus === "CANCELLED";
      const reserving = application.seatStatus === "RELEASED" && nextStatus === "PENDING";

      if (reserving) {
        const updated = await tx.batch.updateMany({
          where: { id: application.batchId, reservedSeats: { lt: application.batch.capacity } },
          data: { reservedSeats: { increment: 1 } },
        });
        if (updated.count !== 1) throw new Error("BATCH_FULL");
      }

      if (releasing) {
        const released = await tx.batch.updateMany({
          where: { id: application.batchId, reservedSeats: { gt: 0 } },
          data: {
            reservedSeats: { decrement: 1 },
            ...(application.batch.status === "FULL" && application.batch.reservedSeats - 1 < application.batch.capacity ? { status: "OPEN" as const } : {}),
          },
        });
        if (released.count !== 1) throw new Error("SEAT_COUNT_INCONSISTENT");
        await tx.auditLog.create({
          data: { userId: admin.id, action: "SEAT_RELEASED", entity: "Application", entityId: application.id, metadata: { batchId: application.batchId, reason: "Application cancelled by admin" } },
        });
      }

      await tx.application.update({
        where: { id },
        data: {
          status: nextStatus,
          seatStatus: releasing ? "RELEASED" : reserving ? "RESERVED" : application.seatStatus,
          confirmedAt: null,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BATCH_FULL") redirect(withApplicationError(returnTo, "batch-full"));
    redirect(withApplicationError(returnTo, "update-failed"));
  }

  revalidatePath("/admin");
  revalidatePath("/admin/applications");
  revalidatePath("/admin/students");
  revalidatePath("/admin/batches");
  revalidatePublicTraining();
  redirect(returnTo);
}

export async function verifyPayment(formData: FormData) {
  const admin = await requireMutation();
  const parsed = z.object({ paymentId: z.string().cuid() }).safeParse({ paymentId: formData.get("paymentId") });
  if (!parsed.success) return { ok: false, message: "Invalid payment review request." };

  try {
    await db.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: parsed.data.paymentId },
        include: { application: { include: { batch: true } } },
      });
      if (!payment || payment.status !== "PENDING_VERIFICATION" || payment.application.status !== "PENDING") throw new Error("PAYMENT_NOT_REVIEWABLE");
      if (!payment.method || !payment.amount || !payment.transactionReference || !payment.paymentDate || !payment.receiptPath || !payment.submittedAt) throw new Error("PAYMENT_NOT_REVIEWABLE");
      if (payment.application.seatStatus !== "RESERVED" || payment.application.batch.reservedSeats < 1 || payment.application.batch.reservedSeats > payment.application.batch.capacity) throw new Error("SEAT_UNAVAILABLE");

      const reviewedAt = new Date();
      const updatedPayment = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING_VERIFICATION" },
        data: { status: "VERIFIED", reviewedById: admin.id, reviewedAt, verifiedAt: reviewedAt, rejectionReason: null },
      });
      const confirmedApplication = await tx.application.updateMany({
        where: { id: payment.applicationId, status: "PENDING", seatStatus: "RESERVED" },
        data: { status: "CONFIRMED", confirmedAt: reviewedAt },
      });
      if (updatedPayment.count !== 1 || confirmedApplication.count !== 1) throw new Error("PAYMENT_NOT_REVIEWABLE");
      await tx.auditLog.create({ data: { userId: admin.id, action: "PAYMENT_VERIFIED", entity: "Payment", entityId: payment.id } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Error && error.message === "SEAT_UNAVAILABLE") return { ok: false, message: "The reserved seat is no longer available. Review the application and batch before verifying." };
    if (error instanceof Error && error.message === "PAYMENT_NOT_REVIEWABLE") return { ok: false, message: "This payment is no longer awaiting review." };
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return { ok: false, message: "Another update occurred during review. Refresh and try again." };
    return { ok: false, message: "Payment verification failed. Please try again." };
  }

  revalidatePaymentReview();
  return { ok: true, message: "Payment verified and admission confirmed." };
}

export async function rejectPayment(formData: FormData) {
  const admin = await requireMutation();
  const parsed = z.object({ paymentId: z.string().cuid(), reason: z.string().trim().min(5).max(500) }).safeParse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, message: "Enter a rejection reason of at least five characters." };

  try {
    const updated = await db.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: parsed.data.paymentId }, include: { application: true } });
      if (!payment || payment.status !== "PENDING_VERIFICATION" || payment.application.status !== "PENDING") return false;
      const reviewedAt = new Date();
      const result = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING_VERIFICATION" },
        data: { status: "REJECTED", reviewedById: admin.id, reviewedAt, verifiedAt: null, rejectionReason: parsed.data.reason },
      });
      if (result.count !== 1) return false;
      await tx.auditLog.create({ data: { userId: admin.id, action: "PAYMENT_REJECTED", entity: "Payment", entityId: payment.id, metadata: { reason: parsed.data.reason } } });
      return true;
    }, { isolationLevel: "Serializable" });
    if (!updated) return { ok: false, message: "This payment is no longer awaiting review." };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return { ok: false, message: "Another update occurred during review. Refresh and try again." };
    return { ok: false, message: "Payment rejection failed. Please try again." };
  }

  revalidatePaymentReview();
  return { ok: true, message: "Payment rejected. The student may correct and resubmit it." };
}

function revalidatePaymentReview() {
  revalidatePath("/admin");
  revalidatePath("/admin/applications");
  revalidatePath("/admin/students");
  revalidatePath("/admin/batches");
  revalidatePublicTraining();
}

function getApplicationReturnPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/admin";
  try {
    const url = new URL(value, "http://nexoventa.local");
    if (url.origin !== "http://nexoventa.local" || !["/admin", "/admin/applications"].includes(url.pathname)) return "/admin";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/admin";
  }
}

function withApplicationError(path: string, error: string) {
  const url = new URL(path, "http://nexoventa.local");
  url.searchParams.set("error", error);
  return `${url.pathname}${url.search}`;
}

const courseInput = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().min(10),
  duration: z.string().trim().min(2),
  fee: z.string().trim().regex(/^\d{1,8}(?:\.\d{1,2})?$/).or(z.literal("")),
});

export async function createCourse(formData: FormData) {
  await requireMutation();
  const parsed = courseInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const { fee, ...course } = parsed.data;
  await db.course.create({ data: { ...course, fee: fee || null } });
  revalidatePath("/admin/courses");
}

export async function updateCourseFee(formData: FormData) {
  await requireMutation();
  const parsed = z.object({
    id: z.string().cuid(),
    fee: z.string().trim().regex(/^\d{1,8}(?:\.\d{1,2})?$/).or(z.literal("")),
  }).safeParse({ id: formData.get("id"), fee: formData.get("fee") });
  if (!parsed.success) return;

  await db.$transaction(async (tx) => {
    await tx.course.update({ where: { id: parsed.data.id }, data: { fee: parsed.data.fee || null } });
    await tx.payment.updateMany({
      where: { status: "NOT_SUBMITTED", application: { is: { batch: { is: { courseId: parsed.data.id } } } } },
      data: { expectedAmount: parsed.data.fee || null },
    });
  });
  revalidatePath("/admin/courses");
  revalidatePublicTraining();
}

export async function toggleCourse(formData: FormData) {
  await requireMutation();
  const id = z.string().min(1).parse(formData.get("id"));
  const course = await db.course.findUnique({ where: { id }, select: { active: true } });

  if (course) {
    await db.course.update({ where: { id }, data: { active: !course.active } });
  }

  revalidatePath("/admin/courses");
}

const batchInput = z.object({
  courseId: z.string().min(1),
  identifier: z.string().trim().min(2),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2026).max(2100),
  daysOfWeek: z.string().trim().min(2),
  startTime: z.string().trim().min(2),
  endTime: z.string().trim().min(2),
  capacity: z.coerce.number().int().min(1).max(1000),
}).superRefine((value, ctx) => validateSchedule(value, ctx));

const batchStatusEnum = ["DRAFT", "OPEN", "CLOSED", "FULL", "ARCHIVED"] as const;
const batchEditFormSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  identifier: z.string().trim().min(2),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2025).max(2100),
  daysOfWeek: z.string().trim().min(1),
  startTime: z.string().trim().min(1),
  endTime: z.string().trim().min(1),
  capacity: z.coerce.number().int().min(1).max(1000),
  status: z.enum(batchStatusEnum),
}).superRefine((value, ctx) => {
  const dayList = value.daysOfWeek.split(",").map((day) => day.trim()).filter(Boolean);
  if (dayList.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["daysOfWeek"], message: "Select at least one day." });
  }

  const startMinutes = parseTimeToMinutes(value.startTime);
  const endMinutes = parseTimeToMinutes(value.endTime);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startTime"], message: "Provide a valid start and end time." });
    return;
  }

  if (endMinutes <= startMinutes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "End time must be later than the start time." });
  }
});

function validateSchedule(value: { daysOfWeek: string; startTime: string; endTime: string }, ctx: z.RefinementCtx) {
  if (value.daysOfWeek.split(",").map((day) => day.trim()).filter(Boolean).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["daysOfWeek"], message: "Select at least one day." });
  }
  const startMinutes = parseTimeToMinutes(value.startTime);
  const endMinutes = parseTimeToMinutes(value.endTime);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startTime"], message: "Provide a valid start and end time." });
  } else if (endMinutes <= startMinutes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "End time must be later than the start time." });
  }
}

function parseTimeToMinutes(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;

  const time24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (time24) {
    const [hoursRaw, minutesRaw] = trimmed.split(":").map(Number);
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
    return hours * 60 + minutes;
  }

  const amPm = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!amPm) return Number.NaN;

  const [, hoursRaw, minutesRaw, periodRaw] = amPm;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const period = periodRaw.toUpperCase();
  const hour24 = period === "PM" ? (hours === 12 ? 12 : hours + 12) : (hours === 12 ? 0 : hours);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return Number.NaN;
  return hour24 * 60 + minutes;
}

function normalizeTimeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("INVALID_TIME");

  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const [hoursRaw, minutesRaw] = trimmed.split(":").map(Number);
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error("INVALID_TIME");
    }

    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    const period = hours >= 12 ? "PM" : "AM";
    return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
  }

  const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (amPmMatch) {
    const [, hoursRaw, minutesRaw, periodRaw] = amPmMatch;
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      throw new Error("INVALID_TIME");
    }

    return `${hours}:${minutes.toString().padStart(2, "0")} ${periodRaw.toUpperCase()}`;
  }

  throw new Error("INVALID_TIME");
}

function normalizeDayList(value: string) {
  const days = value
    .split(",")
    .map((day) => day.trim())
    .filter(Boolean);

  if (days.length === 0) throw new Error("DAYS_REQUIRED");
  return days.join(", ");
}

export async function createBatch(formData: FormData) {
  await requireMutation();
  const parsed = batchInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const data = parsed.data;
  await db.batch.create({
    data: {
      ...data,
      daysOfWeek: normalizeDayList(data.daysOfWeek),
      startTime: normalizeTimeValue(data.startTime),
      endTime: normalizeTimeValue(data.endTime),
    },
  });
  revalidatePath("/admin/batches");
  revalidatePublicTraining();
}

export async function updateBatch(formData: FormData) {
  await requireMutation();
  const parsed = batchEditFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const { id, courseId, identifier, month, year, daysOfWeek, startTime, endTime, capacity, status } = parsed.data;
  const normalizedDays = normalizeDayList(daysOfWeek);
  const normalizedStart = normalizeTimeValue(startTime);
  const normalizedEnd = normalizeTimeValue(endTime);

  const current = await db.batch.findUnique({ where: { id } });
  if (!current) return;

  if (capacity < current.reservedSeats) return;

  const nextStatus = status === "OPEN" && current.reservedSeats >= capacity ? "FULL" : status;

  await db.batch.update({
    where: { id },
    data: {
      courseId,
      identifier,
      month,
      year,
      daysOfWeek: normalizedDays,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      capacity,
      status: nextStatus,
    },
  });

  revalidatePath("/admin/batches");
  revalidatePath("/training");
}

export async function updateBatchStatus(formData: FormData) {
  await requireMutation();
  const parsed = z.object({ id: z.string().cuid(), status: z.enum(batchStatusEnum) }).safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) redirect("/admin/batches?error=invalid-status");

  const updated = await db.batch.updateMany({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });
  if (updated.count !== 1) redirect("/admin/batches?error=batch-not-found");

  revalidatePath("/admin/batches");
  revalidatePublicTraining();
  redirect("/admin/batches?status=updated");
}

function revalidatePublicTraining() {
  revalidatePath("/");
  revalidatePath("/training");
  revalidatePath("/admission");
}

const announcementInput = z.object({ title: z.string().trim().min(2), slug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/), content: z.string().trim().min(10) });

export async function createAnnouncement(formData: FormData) {
  await requireMutation();
  const parsed = announcementInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await db.announcement.create({ data: parsed.data });
  revalidatePath("/admin/announcements");
}

export async function toggleAnnouncement(formData: FormData) {
  await requireMutation();
  const id = z.string().min(1).parse(formData.get("id"));
  const item = await db.announcement.findUnique({ where: { id }, select: { published: true } });

  if (item) {
    await db.announcement.update({
      where: { id },
      data: { published: !item.published, publishedAt: !item.published ? new Date() : null },
    });
  }

  revalidatePath("/admin/announcements");
  revalidatePath("/announcements");
}

const adminProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional().or(z.literal("")),
  email: z.string().trim().email(),
});

export async function updateAdminProfile(formData: FormData) {
  const admin = await requireMutation();
  const parsed = adminProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });

  if (!parsed.success) return;

  const { name, email } = parsed.data;
  await db.user.update({
    where: { id: admin.id },
    data: { name: name || null, email: email.toLowerCase() },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
}

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine((value) => value.newPassword === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match.",
});

export async function changeAdminPassword(formData: FormData) {
  const admin = await requireMutation();
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return;

  const user = await db.user.findUnique({ where: { id: admin.id } });
  if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) return;

  await db.user.update({
    where: { id: admin.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });

  revalidatePath("/admin/settings");
}

async function requireMutation() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
