import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApplicationExport } from "@/components/admin/application-export";
import { ApplicationTable } from "@/components/admin/application-table";
import { TrainingSlotFilters, type TrainingSlotSummary } from "@/components/admin/training-slot-filters";
import { ApplicationStatus } from "@/lib/generated/prisma/enums";

export const dynamic = "force-dynamic";

const applicationStatuses = Object.values(ApplicationStatus);

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ slot?: string; status?: string; error?: string }> }) {
	await requireAdmin();
	const params = await searchParams;
	const [batches, totalApplications] = await Promise.all([
		db.batch.findMany({
			where: { OR: [{ status: { in: ["OPEN", "FULL"] } }, { applications: { some: {} } }] },
			include: { course: true, _count: { select: { applications: true } } },
			orderBy: [{ year: "desc" }, { month: "desc" }, { startTime: "asc" }],
		}),
		db.application.count(),
	]);

	const selectedSlotId = batches.some((batch) => batch.id === params.slot) ? params.slot : undefined;
	const selectedStatus = applicationStatuses.find((status) => status === params.status) || "";
	const slotWhere = selectedSlotId ? { batchId: selectedSlotId } : undefined;
	const applicationWhere = { ...slotWhere, ...(selectedStatus ? { status: selectedStatus } : {}) };
	const [applications, groupedStatuses] = await Promise.all([
		db.application.findMany({ where: applicationWhere, include: { student: true, batch: { include: { course: true } }, payment: { include: { reviewedBy: true } } }, orderBy: { appliedAt: "desc" } }),
		db.application.groupBy({ by: ["status"], where: slotWhere, _count: { _all: true } }),
	]);

	const statusCounts = Object.fromEntries(applicationStatuses.map((status) => [status, 0])) as Record<(typeof applicationStatuses)[number], number>;
	for (const item of groupedStatuses) statusCounts[item.status] = item._count._all;

	const slots: TrainingSlotSummary[] = batches.map((batch) => ({
		id: batch.id,
		identifier: batch.identifier,
		month: batch.month,
		year: batch.year,
		startTime: batch.startTime,
		endTime: batch.endTime,
		courseName: batch.course.name,
		applicationCount: batch._count.applications,
	}));
	const query = new URLSearchParams();
	if (selectedSlotId) query.set("slot", selectedSlotId);
	if (selectedStatus) query.set("status", selectedStatus);
	const returnTo = `/admin/applications${query.size ? `?${query.toString()}` : ""}`;
	const errorMessage = params.error === "batch-full"
		? "This batch is full. Choose a different status or training slot."
		: params.error === "update-failed"
			? "The application status could not be updated. Please try again."
			: null;

	return (
		<main className="admin-page">
			<div className="shell">
				<div className="admin-top">
					<div><p className="eyebrow">Admissions</p><h1>Applications</h1></div>
					<ApplicationExport />
				</div>
				<TrainingSlotFilters slots={slots} totalApplications={totalApplications} selectedSlotId={selectedSlotId} selectedStatus={selectedStatus} statusCounts={statusCounts} />
				{errorMessage && <p className="admin-error-message" role="alert">{errorMessage}</p>}
				<div className="admin-table-wrap">
					<div className="admin-section-head">
						<div><p className="eyebrow">Review queue</p><h2>{applications.length} applications</h2></div>
					</div>
					<ApplicationTable applications={applications.map((application) => ({
						id: application.id,
						student: { fullName: application.student.fullName, phone: application.student.phone, email: application.student.email },
						batch: { identifier: application.batch.identifier, startTime: application.batch.startTime, endTime: application.batch.endTime, course: { name: application.batch.course.name, fee: application.batch.course.fee?.toString() ?? null } },
						payment: application.payment ? {
							id: application.payment.id,
							status: application.payment.status,
							courseFee: application.payment.expectedAmount?.toString() ?? null,
							method: application.payment.method,
							amount: application.payment.amount?.toString() ?? null,
							transactionReference: application.payment.transactionReference,
							paymentDate: application.payment.paymentDate?.toISOString() ?? null,
							submittedAt: application.payment.submittedAt?.toISOString() ?? null,
								reviewedAt: application.payment.reviewedAt?.toISOString() ?? null,
								reviewedBy: application.payment.reviewedBy?.name || application.payment.reviewedBy?.email || null,
							receiptAvailable: Boolean(application.payment.receiptPath),
							rejectionReason: application.payment.rejectionReason,
						} : null,
						appliedAt: application.appliedAt.toISOString(),
						status: application.status,
					}))} returnTo={returnTo} />
				</div>
			</div>
		</main>
	);
}
