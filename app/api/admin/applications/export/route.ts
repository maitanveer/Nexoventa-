import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportKind = "all" | "selected";

const exportDefinitions: Record<ExportKind, { label: string; sheetName: string; filename: string; emptyMessage: string }> = {
  all: {
    label: "All Applicants",
    sheetName: "All Applicants",
    filename: "Nexoventa-All-Applicants",
    emptyMessage: "No applicants found.",
  },
  selected: {
    label: "Confirmed Students",
    sheetName: "Confirmed Students",
    filename: "Nexoventa-Confirmed-Students",
    emptyMessage: "No confirmed students found.",
  },
};

function isExportKind(value: string | null): value is ExportKind {
  return value === "all" || value === "selected";
}

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const kind = new URL(request.url).searchParams.get("kind") || "all";
  if (!isExportKind(kind)) return NextResponse.json({ message: "Invalid export type." }, { status: 400 });

  const definition = exportDefinitions[kind];
  const statusFilter = kind === "all" ? undefined : { status: "CONFIRMED" as const };
  const applications = await db.application.findMany({
    where: statusFilter ? statusFilter : undefined,
    select: {
      student: { select: { fullName: true, phone: true, email: true } },
      batch: { select: { identifier: true, startTime: true, endTime: true, course: { select: { name: true } } } },
      appliedAt: true,
      status: true,
    },
    orderBy: { appliedAt: "desc" },
  });

  if (applications.length === 0) {
    return NextResponse.json({ message: definition.emptyMessage }, { status: 404 });
  }

  const rows = applications.map((application, index) => ({
    "No.": index + 1,
    "Student Name": application.student.fullName,
    Phone: application.student.phone,
    Email: application.student.email,
    Course: application.batch.course.name,
    "Batch / Slot": application.batch.identifier,
    "Training Slot": `${application.batch.startTime} – ${application.batch.endTime}`,
    "Application Date": application.appliedAt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
    Status: application.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  for (const cell of ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1", "I1"]) {
    worksheet[cell].s = { font: { bold: true } };
  }
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 17 },
    { wch: 32 },
    { wch: 24 },
    { wch: 18 },
    { wch: 21 },
    { wch: 20 },
    { wch: 14 },
  ];
  worksheet["!autofilter"] = { ref: worksheet["!ref"] || "A1:H1" };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, definition.sheetName);
  const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${definition.filename}-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
