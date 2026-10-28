"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Copy } from "lucide-react";
import { submitAdmission } from "./actions";
import { clearVerifiedPaymentAccess, submitPaymentReceipt, type PaymentSubmissionResult } from "./payment-actions";
import { whatsappUrl } from "@/lib/whatsapp";

type BatchOption = { id: string; label: string; course: string; fee: string | null; available: number };
type PaymentInstructions = Record<"BANK_TRANSFER" | "SADAPAY", string>;
type ExistingPayment = {
  applicationId: string;
  courseName: string;
  batchIdentifier: string;
  fee: string | null;
  status: "NOT_SUBMITTED" | "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
  amount: string | null;
  method: "BANK_TRANSFER" | "SADAPAY" | null;
  transactionReference: string | null;
  paymentDate: string | null;
  submittedAt: string | null;
  rejectionReason: string | null;
};

export function AdmissionForm({ batches, instructions, existingPayment, selectedBatchId: initialBatchId }: { batches: BatchOption[]; instructions: PaymentInstructions; existingPayment: ExistingPayment | null; selectedBatchId?: string }) {
  const [result, setResult] = useState<{ message: string; success?: boolean; name?: string; applicationId?: string; courseName?: string; fee?: string | null }>();
  const [pending, setPending] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId || "");
  const [slotError, setSlotError] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (!batches.some((batch) => batch.id === formData.get("batchId"))) {
      setSlotError(true);
      setResult({ message: "Please select a training slot." });
      return;
    }
    setSlotError(false);
    setPending(true);
    setResult(undefined);
    const response = await submitAdmission(formData);
    setPending(false);
    if (response.ok) setResult({ success: true, message: "Application received", name: response.name, applicationId: response.applicationId, courseName: response.courseName, fee: response.fee });
    else {
      setSlotError(Boolean(response.fieldErrors?.batchId?.length));
      setResult({ message: response.message });
    }
  }

  if (existingPayment) return <StudentPaymentForm payment={existingPayment} instructions={instructions} />;
  if (result?.success && result.applicationId) {
    return <StudentPaymentForm payment={{
      applicationId: result.applicationId,
      courseName: result.courseName || "Training course",
      batchIdentifier: "New application",
      fee: result.fee ?? null,
      status: "NOT_SUBMITTED",
      amount: null,
      method: null,
      transactionReference: null,
      paymentDate: null,
      submittedAt: null,
      rejectionReason: null,
    }} instructions={instructions} studentName={result.name} />;
  }

  return <form className="admission-form" onSubmit={handleSubmit} noValidate>
    {result && <div className="form-alert" role="alert">{result.message}</div>}
    <div className="form-section"><p className="eyebrow">Your details</p><div className="form-grid"><Field label="Full name" name="fullName" required /><Field label="Father / guardian name" name="fatherName" required /><Field label="Phone number" name="phone" type="tel" required /><Field label="WhatsApp number" name="whatsapp" type="tel" required /><Field label="Email address" name="email" type="email" required /><Field label="Education" name="education" required /></div></div>
    <div className="form-section"><fieldset className={`training-slot-group${slotError ? " has-error" : ""}`} aria-describedby={slotError ? "training-slot-error" : undefined}><legend>Select Your Preferred Training Slot</legend><div className="training-slot-options">{batches.map((batch, index) => <label className={`training-slot-option${selectedBatchId === batch.id ? " is-selected" : ""}`} key={batch.id}><input type="radio" name="batchId" value={batch.id} checked={selectedBatchId === batch.id} required onChange={() => { setSelectedBatchId(batch.id); setSlotError(false); }} /><span><strong>Slot {index + 1} · {batch.course}</strong><small>{batch.label}</small><small>{batch.available} seats available</small><small>{batch.fee ? `Course fee: PKR ${batch.fee}` : "Course fee: Contact admissions"}</small></span></label>)}</div>{slotError && <p className="training-slot-error" id="training-slot-error" role="alert">Please select a training slot.</p>}</fieldset></div>
    <div className="form-section"><p className="eyebrow">A little more (optional)</p><div className="form-grid"><Field label="CNIC" name="cnic" /><Field label="Current occupation" name="occupation" /><Field label="Medical billing experience" name="experience" /><Field label="Address" name="address" /><label className="field field-wide"><span>Additional message</span><textarea name="notes" rows={4} /></label></div></div>
    <button className="submit-button" type="submit" disabled={pending}>{pending ? "Submitting..." : "Submit application"} <ArrowRight size={17} /></button>
  </form>;
}

function StudentPaymentForm({ payment, instructions, studentName }: { payment: ExistingPayment; instructions: PaymentInstructions; studentName?: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PaymentSubmissionResult | null>(null);
  const [method, setMethod] = useState<keyof PaymentInstructions>("BANK_TRANSFER");
  const [receiptError, setReceiptError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("receipt");
    if (!(file instanceof File) || file.size < 1 || file.size > 2 * 1024 * 1024) {
      setReceiptError("Choose an image up to 2 MB.");
      return;
    }
    setReceiptError(null);
    setPending(true);
    const response = await submitPaymentReceipt(new FormData(form));
    setResult(response);
    setPending(false);
  }

  const paymentSubmitted = payment.status === "PENDING_VERIFICATION" || payment.status === "VERIFIED" || result?.ok;
  if (paymentSubmitted) {
    const verified = payment.status === "VERIFIED";
    const submittedAmount = result?.ok ? result.amount : payment.amount;
    const paidAmount = submittedAmount ? Number(submittedAmount) : null;
    const courseFee = payment.fee ? Number(payment.fee) : null;
    const remainingBalance = paidAmount === null || courseFee === null ? null : Math.max(courseFee - paidAmount, 0);
    const paymentSummary = verified
      ? paidAmount === null
        ? "Your payment has been verified. Contact admissions to confirm the recorded amount and any balance."
        : remainingBalance === 0
        ? `Full course fee of PKR ${formatAmount(courseFee ?? 0)} is paid and verified.`
        : remainingBalance === null
          ? `Verified payment: PKR ${formatAmount(paidAmount)}.`
          : `Verified payment: PKR ${formatAmount(paidAmount)}. Remaining balance: PKR ${formatAmount(remainingBalance)}.`
      : paidAmount === null
        ? "Your receipt is awaiting administrator verification."
        : courseFee !== null && paidAmount >= courseFee
          ? `Submitted amount: PKR ${formatAmount(paidAmount)} (pending verification). The full fee will be marked paid only after an administrator verifies the transaction.`
          : `Submitted amount: PKR ${formatAmount(paidAmount)} (pending verification). If verified, remaining balance: PKR ${formatAmount(remainingBalance ?? 0)}.`;
    return <div className="success-panel"><CheckCircle2 size={42} /><p className="eyebrow">{verified ? "Payment verified" : "Application received"}</p><h2>{studentName ? `Thank you, ${studentName}.` : "Payment submitted."}</h2><p>{paymentSummary} {verified ? "Your admission is confirmed." : "Your payment and admission remain pending until an authorized Nexoventa administrator verifies the transaction. Uploading a receipt alone does not confirm payment or admission."}</p><p><strong>{payment.courseName}</strong>{payment.batchIdentifier !== "New application" ? ` · ${payment.batchIdentifier}` : ""}</p>{result && !result.ok && <div className="form-alert" role="alert">{result.message}</div>}<div className="form-actions"><Link className="text-link" href="/training">Back to training <ArrowRight size={16} /></Link><a className="text-link" href={whatsappUrl(`Hello Nexoventa, I submitted a medical billing training application under the name ${studentName || ""}.`)}>Contact admissions <ArrowRight size={16} /></a>{verified && <form action={clearVerifiedPaymentAccess}><input type="hidden" name="applicationId" value={payment.applicationId} /><button className="admin-action" type="submit">Start a new application</button></form>}</div></div>;
  }

  return <div className="admission-form payment-form">
    <p className="eyebrow">Payment details</p>
    <h2>{studentName ? `Thank you, ${studentName}.` : "Complete your payment submission."}</h2>
    <p className="payment-course-summary"><strong>{payment.courseName}</strong>{payment.batchIdentifier !== "New application" ? ` · ${payment.batchIdentifier}` : ""}<br />{payment.fee ? `Full course fee: PKR ${payment.fee}` : "Course fee has not been configured."}</p>
    {Number(payment.fee) === 18000 && <p className="payment-policy-notice"><strong>Full Course Fee: PKR 18,000.</strong> Students may pay the full fee of PKR 18,000 upfront or make a minimum initial payment of PKR 8,000. Payments below PKR 8,000 are not accepted. If you initially pay PKR 8,000, your remaining balance will be PKR 10,000. Select Bank Transfer (UBL) or SadaPay, transfer the amount you intend to pay, enter the actual transaction details, and upload a clear receipt. Your payment and admission will remain pending until an authorized Nexoventa administrator verifies the transaction. Uploading a receipt alone does not confirm payment or admission.</p>}
    {payment.status === "REJECTED" && <div className="form-alert" role="alert"><strong>Previous receipt rejected.</strong> {payment.rejectionReason || "Please check the payment details and submit a corrected receipt."}</div>}
    <form onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="applicationId" value={payment.applicationId} />
      <div className="form-grid">
        <label className="field"><span>Payment method *</span><select name="method" value={method} onChange={(event) => setMethod(event.currentTarget.value as keyof PaymentInstructions)} required><option value="BANK_TRANSFER">Bank Transfer (UBL)</option><option value="SADAPAY">SadaPay</option></select></label>
        <Field label="Amount actually transferred (PKR)" name="amount" type="number" required min="8000" max={payment.fee ?? undefined} />
        <Field label="Transaction reference / ID" name="transactionReference" required />
        <Field label="Payment date" name="paymentDate" type="date" required />
        <label className="field field-wide"><span>Payment receipt image (JPEG, PNG, WebP; up to 2 MB) *</span><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => { const file = event.currentTarget.files?.[0]; setReceiptError(file && file.size > 2 * 1024 * 1024 ? "The selected image is larger than 2 MB." : null); }} />{receiptError && <small className="training-slot-error" role="alert">{receiptError}</small>}</label>
      </div>
      <PaymentInstructionDetails method={method} value={instructions[method]} />
      {result && !result.ok && <div className="form-alert" role="alert">{result.message}</div>}
      <button className="submit-button" type="submit" disabled={pending || !instructions[method] || !payment.fee}>{pending ? "Submitting receipt..." : "Submit for verification"} <ArrowRight size={17} /></button>
      {!payment.fee && <p className="payment-pending-note">The course fee is not configured yet. Contact admissions before making a payment.</p>}
      <p className="payment-pending-note">Admission remains pending until an administrator verifies the payment.</p>
    </form>
  </div>;
}

function Field({ label, name, type = "text", required = false, min, max }: { label: string; name: string; type?: string; required?: boolean; min?: string; max?: string }) { return <label className="field"><span>{label}{required ? " *" : ""}</span><input name={name} type={type} required={required} min={min ?? (type === "number" ? "0.01" : undefined)} max={max} step={type === "number" ? "0.01" : undefined} /></label>; }

function PaymentInstructionDetails({ method, value }: { method: keyof PaymentInstructions; value: string }) {
  const label = method === "BANK_TRANSFER" ? "Bank Transfer (UBL) receiving details" : "SadaPay receiving details";
  const lines = value.replaceAll("\\n", "\n").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf(":");
    return separator > -1 ? { name: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() } : { name: "", value: line };
  });
  if (lines.length === 0) return <div className="payment-instructions"><p className="eyebrow">{label}</p><p>Payment details for this method have not been configured. Contact admissions before sending money.</p></div>;
  return <div className="payment-instructions"><p className="eyebrow">{label}</p><dl>{lines.map((line, index) => <div className="payment-instruction-row" key={`${line.name}-${index}`}><dt>{line.name}</dt><dd>{line.value}</dd>{/account number|iban|registered number/i.test(line.name) && <CopyPaymentValue value={line.value} />}</div>)}</dl></div>;
}

function CopyPaymentValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed(true);
    }
  }
  return <><button className="copy-payment-detail" type="button" aria-label={`Copy ${value}`} title="Copy" onClick={copyValue}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>{failed && <small className="payment-copy-error" role="status">Copy unavailable; select the number to copy.</small>}</>;
}

function formatAmount(amount: number) {
  return amount.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}