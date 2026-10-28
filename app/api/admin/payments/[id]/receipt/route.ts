import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertPaymentBucketIsPrivate } from "@/lib/payment-storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ message: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const { id } = await params;
  const parsedId = z.string().cuid().safeParse(id);
  if (!parsedId.success) return NextResponse.json({ message: "Invalid payment ID." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const payment = await db.payment.findUnique({ where: { id: parsedId.data }, select: { receiptPath: true } });
  if (!payment?.receiptPath) return NextResponse.json({ message: "Receipt not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });

  try {
    const storage = await assertPaymentBucketIsPrivate();
    const { data, error } = await storage.createSignedUrl(payment.receiptPath, 60);
    if (error || !data?.signedUrl) return NextResponse.json({ message: "Receipt is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ message: "Receipt storage is unavailable or misconfigured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}