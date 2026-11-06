"use client";

import { useState } from "react";
import { ArrowRight, Check, Copy, MessageCircle, CheckCircle2 } from "lucide-react";
import { submitAdmission } from "./actions";
import { whatsappUrl } from "@/lib/whatsapp";

type BatchOption = { id: string; label: string; course: string; fee: string | null; available: number };

function formatPkr(amount: string) {
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount)
    ? new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(numericAmount)
    : amount;
}

function getFeeNotice(courseName: string, fee: string | null) {
  const feeSummary = fee
    ? `${courseName} Course Fee: PKR ${formatPkr(fee)}.`
    : `${courseName} Course Fee has not been set. Please confirm the fee with admissions before payment.`;
  return `${feeSummary} Students must pay a minimum advance of PKR 1,500 to secure admission consideration. The advance is deducted from the total course fee. Please transfer your advance using one of the payment methods below and share a clear payment screenshot with Nexoventa through WhatsApp. Your admission will only be confirmed after the administrator reviews your application and payment.`;
}

export function AdmissionForm({ batches, selectedBatchId: initialBatchId }: { batches: BatchOption[]; selectedBatchId?: string }) {
  const [result, setResult] = useState<{
    message: string;
    success?: boolean;
    name?: string;
    phone?: string;
    applicationId?: string;
    courseName?: string;
    fee?: string | null;
    batchIdentifier?: string;
  }>();
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
    if (response.ok) {
      setResult({
        success: true,
        message: "Application received",
        name: response.name,
        phone: response.phone,
        applicationId: response.applicationId,
        courseName: response.courseName,
        fee: response.fee,
        batchIdentifier: response.batchIdentifier,
      });
    } else {
      setSlotError(Boolean(response.fieldErrors?.batchId?.length));
      setResult({ message: response.message });
    }
  }

  if (result?.success && result.applicationId) {
    const whatsappMessage = [
      "Hello Nexoventa Team,",
      "",
      `I have submitted my ${result.courseName ?? "selected course"} admission application.`,
      "",
      `Name: ${result.name}`,
      `Phone: ${result.phone}`,
      `Batch: ${result.batchIdentifier}`,
      "",
      "I have paid my course advance and would like to share my payment screenshot for verification.",
      "",
      "Please review my application and payment.",
      "",
      "Thank you.",
    ].join("\n");
    const contactUrl = whatsappUrl(whatsappMessage);

    return (
      <section className="success-panel" aria-live="polite">
        <CheckCircle2 size={42} />
        <p className="eyebrow">Application pending review</p>
        <h2>Thank you, {result.name}.</h2>
        <p>Your application for <strong>{result.courseName}</strong> · {result.batchIdentifier} has been received and is pending administrator review.</p>
        <p className="payment-policy-notice">{getFeeNotice(result.courseName ?? "Course", result.fee ?? null)}</p>
        {result.fee && Number.isFinite(Number(result.fee)) && <p className="payment-pending-note">For example, a PKR 1,500 advance leaves a remaining course balance of PKR {formatPkr(String(Math.max(Number(result.fee) - 1500, 0)))}.</p>}
        <div className="payment-instructions">
          <p className="eyebrow">UBL Bank Transfer</p>
          <dl>
            <PaymentDetail label="Bank" value="United Bank Limited (UBL)" />
            <PaymentDetail label="Account holder" value="Basharat Ali Jan" />
            <PaymentDetail label="Account number" value="355141816" copy />
            <PaymentDetail label="IBAN" value="PK07UNIL0109000355141816" copy />
          </dl>
        </div>
        <div className="payment-instructions">
          <p className="eyebrow">SadaPay</p>
          <dl>
            <PaymentDetail label="Account holder" value="Basharat Ali Jan" />
            <PaymentDetail label="Registered number" value="03495728562" copy />
          </dl>
        </div>
        <p>Please manually attach a clear payment screenshot and press <strong>Send</strong> in WhatsApp. The screenshot is not sent automatically.</p>
        {contactUrl ? (
          <a className="whatsapp-admission-button" href={contactUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={19} />
            Submit Fee &amp; Share Screenshot via WhatsApp
          </a>
        ) : (
          <p className="form-alert" role="alert">WhatsApp contact is unavailable. Please contact Nexoventa to obtain its WhatsApp number.</p>
        )}
      </section>
    );
  }

  return (
    <form className="admission-form" onSubmit={handleSubmit} noValidate>
      {result && <div className="form-alert" role="alert">{result.message}</div>}
      <div className="form-section">
        <p className="eyebrow">Your details</p>
        <div className="form-grid">
          <Field label="Full name" name="fullName" required />
          <Field label="Father / guardian name" name="fatherName" required />
          <Field label="Phone number" name="phone" type="tel" required />
          <Field label="WhatsApp number" name="whatsapp" type="tel" required />
          <Field label="Email address" name="email" type="email" required />
          <Field label="Education" name="education" required />
        </div>
      </div>
      <div className="form-section">
        <fieldset className={`training-slot-group${slotError ? " has-error" : ""}`} aria-describedby={slotError ? "training-slot-error" : undefined}>
          <legend>Select Your Preferred Training Slot</legend>
          <div className="training-slot-options">
            {batches.map((batch, index) => (
              <label className={`training-slot-option${selectedBatchId === batch.id ? " is-selected" : ""}`} key={batch.id}>
                <input type="radio" name="batchId" value={batch.id} checked={selectedBatchId === batch.id} required onChange={() => { setSelectedBatchId(batch.id); setSlotError(false); }} />
                <span>
                  <strong>Slot {index + 1} · {batch.course}</strong>
                  <small>{batch.label}</small>
                  <small>{batch.available} seats available</small>
                  <small>{batch.fee ? `Course fee: PKR ${batch.fee}` : "Course fee: Contact admissions"}</small>
                </span>
              </label>
            ))}
          </div>
          {slotError && <p className="training-slot-error" id="training-slot-error" role="alert">Please select a training slot.</p>}
        </fieldset>
      </div>
      <div className="form-section">
        <p className="eyebrow">A little more (optional)</p>
        <div className="form-grid">
          <Field label="CNIC" name="cnic" />
          <Field label="Current occupation" name="occupation" />
          <Field label="Medical billing experience" name="experience" />
          <Field label="Address" name="address" />
          <label className="field field-wide"><span>Additional message</span><textarea name="notes" rows={4} /></label>
        </div>
      </div>
      <button className="submit-button" type="submit" disabled={pending}>
        {pending ? "Submitting..." : "Submit application"} <ArrowRight size={17} />
      </button>
    </form>
  );
}

function Field({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return <label className="field"><span>{label}{required ? " *" : ""}</span><input name={name} type={type} required={required} /></label>;
}

function PaymentDetail({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="payment-instruction-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {copy && <CopyPaymentValue label={label} value={value} />}
    </div>
  );
}

function CopyPaymentValue({ label, value }: { label: string; value: string }) {
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

  return (
    <>
      <button className="copy-payment-detail" type="button" aria-label={`Copy ${label}`} title="Copy" onClick={copyValue}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      {failed && <small className="payment-copy-error" role="status">Copy unavailable; select the number to copy.</small>}
    </>
  );
}
