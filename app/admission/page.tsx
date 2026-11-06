import { AdmissionForm } from "./admission-form";
import { getAvailableSeats, getPublicTrainingBatches } from "@/lib/batch-eligibility";

export const dynamic = "force-dynamic";

export default async function AdmissionPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const params = await searchParams;
  const batches = await getPublicTrainingBatches();
  const options = batches.map((batch) => ({ id: batch.id, course: batch.course.name, fee: batch.course.fee?.toString() ?? null, label: `${batch.startTime} – ${batch.endTime} · ${batch.daysOfWeek.replaceAll(", ", " · ")}`, available: getAvailableSeats(batch) }));
  return <main><section className="page-intro shell"><p className="eyebrow">Admission</p><h1>Reserve your place<br /><em>in the next batch.</em></h1><p>Tell us a little about yourself and choose a training slot. Every application is reviewed before confirmation.</p></section><section className="shell admission-layout"><div className="admission-aside"><p className="eyebrow">How it works</p><ol><li><strong>Choose a slot</strong><span>Find a time that fits your routine.</span></li><li><strong>Send your application</strong><span>Your application will be reviewed by an administrator.</span></li><li><strong>Pay your advance</strong><span>Share your payment screenshot manually through WhatsApp for review.</span></li></ol></div><AdmissionForm batches={options} selectedBatchId={options.some((option) => option.id === params.batch) ? params.batch : undefined} /></section></main>;
}
