import { AdmissionForm } from "./admission-form";
import { getAvailableSeats, getPublicTrainingBatches } from "@/lib/batch-eligibility";
import { getStudentPaymentApplication } from "@/lib/student-payment";

export const dynamic = "force-dynamic";

export default async function AdmissionPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const params = await searchParams;
  const [batches, existingPayment] = await Promise.all([getPublicTrainingBatches(), getStudentPaymentApplication()]);
  const options = batches.map((batch) => ({ id: batch.id, course: batch.course.name, fee: batch.course.fee?.toString() ?? null, label: `${batch.startTime} – ${batch.endTime} · ${batch.daysOfWeek.replaceAll(", ", " · ")}`, available: getAvailableSeats(batch) }));
  const instructions = {
    BANK_TRANSFER: process.env.PAYMENT_INSTRUCTIONS_BANK_TRANSFER?.trim() || "",
    SADAPAY: process.env.PAYMENT_INSTRUCTIONS_SADAPAY?.trim() || "",
  };
  return <main><section className="page-intro shell"><p className="eyebrow">Admission</p><h1>Reserve your place<br /><em>in the next batch.</em></h1><p>Tell us a little about yourself and choose a training slot. Every application is reviewed before confirmation.</p></section><section className="shell admission-layout"><div className="admission-aside"><p className="eyebrow">How it works</p><ol><li><strong>Choose a slot</strong><span>Find a time that fits your routine.</span></li><li><strong>Send your application</strong><span>We keep your information private.</span></li><li><strong>Submit your payment receipt</strong><span>Admission stays pending until an administrator verifies your payment.</span></li></ol></div><AdmissionForm batches={options} instructions={instructions} existingPayment={existingPayment} selectedBatchId={options.some((option) => option.id === params.batch) ? params.batch : undefined} /></section></main>;
}
