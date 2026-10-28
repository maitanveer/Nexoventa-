"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rejectPayment, verifyPayment } from "@/app/admin/actions";

export function PaymentReviewControls({ paymentId, status, hasReceipt }: { paymentId: string; status: string; hasReceipt: boolean }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleVerify() {
    if (!window.confirm("Verify that the payment was received and confirm this student's admission?")) return;
    setPending(true);
    const formData = new FormData();
    formData.set("paymentId", paymentId);
    const result = await verifyPayment(formData);
    setMessage(result.message);
    setPending(false);
    if (result.ok) router.refresh();
  }

  async function handleReject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData();
    formData.set("paymentId", paymentId);
    formData.set("reason", reason);
    const result = await rejectPayment(formData);
    setMessage(result.message);
    setPending(false);
    if (result.ok) router.refresh();
  }

  return <div className="payment-review-controls">
    {hasReceipt && <a className="admin-action" href={`/api/admin/payments/${encodeURIComponent(paymentId)}/receipt`} target="_blank" rel="noopener noreferrer">View receipt</a>}
    {status === "PENDING_VERIFICATION" && <>
      <button className="admin-action primary" type="button" disabled={pending || !hasReceipt} onClick={handleVerify}>{pending ? "Reviewing..." : "Verify"}</button>
      <form onSubmit={handleReject} className="payment-rejection-form">
        <label className="field"><span>Rejection reason</span><input value={reason} onChange={(event) => setReason(event.currentTarget.value)} minLength={5} maxLength={500} required /></label>
        <button className="admin-action" type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Reviewing..." : "Reject"}</button>
      </form>
    </>}
    {message && <small className="payment-review-message" role="status">{message}</small>}
  </div>;
}