import { TrainingSlotFilters, type TrainingSlotSummary } from "@/components/admin/training-slot-filters";
import { logoutAdmin } from "./actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const admin = await requireAdmin();
  const [applications, totalApplications, pending, confirmed, rejected, openBatches, fullBatches, batchTotals, students, batches] = await Promise.all([
    db.application.findMany({ include: { student: true, batch: { include: { course: true } } }, orderBy: { appliedAt: "desc" }, take: 50 }),
    db.application.count(),
    db.application.count({ where: { status: "PENDING" } }),
    db.application.count({ where: { status: "CONFIRMED" } }),
    db.application.count({ where: { status: "REJECTED" } }),
    db.batch.count({ where: { status: "OPEN", course: { active: true } } }),
    db.batch.count({ where: { status: "FULL" } }),
    db.batch.findMany({ where: { status: { in: ["OPEN", "FULL"] } }, select: { capacity: true, reservedSeats: true } }),
    db.student.count(),
    db.batch.findMany({
      where: { OR: [{ status: { in: ["OPEN", "FULL"] } }, { applications: { some: {} } }] },
      include: { course: true, _count: { select: { applications: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }, { startTime: "asc" }],
    }),
  ]);

  const availableSeats = batchTotals.reduce((total, batch) => total + Math.max(batch.capacity - batch.reservedSeats, 0), 0);
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

  return (
    <main className="admin-page">
      <div className="shell">
        <div className="admin-top">
          <div><p className="eyebrow">Admin dashboard</p><h1>Good day, {admin.name || admin.email}.</h1></div>
          <form action={logoutAdmin}><button className="admin-logout" type="submit">Sign out</button></form>
        </div>

        <div className="admin-stats">
          <Stat label="Applications" value={totalApplications} />
          <Stat label="Pending" value={pending} />
          <Stat label="Confirmed" value={confirmed} />
          <Stat label="Rejected" value={rejected} />
          <Stat label="Open batches" value={openBatches} />
          <Stat label="Available seats" value={availableSeats} />
          <Stat label="Full batches" value={fullBatches} />
          <Stat label="Students" value={students} />
        </div>

        <TrainingSlotFilters slots={slots} totalApplications={totalApplications} />

        <div className="admin-actions-row">
          <a className="admin-action primary" href="/admin/courses">Add Course</a>
          <a className="admin-action" href="/admin/batches">Add Batch</a>
          <a className="admin-action" href="/admin/announcements">Add Announcement</a>
          <a className="admin-action" href="/admin/applications">View Applications</a>
        </div>

        <section className="admin-table-wrap">
          <div className="admin-section-head">
            <div><p className="eyebrow">Recent applications</p><h2>Review queue</h2></div>
            <span>{applications.length} shown</span>
          </div>
          <div className="admin-table-scroll">
            <table>
              <thead><tr><th>Student</th><th>Training slot</th><th>Course / batch</th><th>Applied</th><th>Status</th><th>Update</th></tr></thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id}>
                    <td><strong>{application.student.fullName}</strong><small>{application.student.phone}</small></td>
                    <td><span className="training-slot-badge">{application.batch.startTime} – {application.batch.endTime}</span></td>
                    <td>{application.batch.course.name}<small>{application.batch.identifier}</small></td>
                    <td>{application.appliedAt.toLocaleDateString("en-GB")}</td>
                    <td><span className={`table-status status-${application.status.toLowerCase()}`}>{application.status}</span></td>
                    <td><a className="admin-action" href="/admin/applications">Review payment</a></td>
                  </tr>
                ))}
                {applications.length === 0 && <tr><td colSpan={6}><div className="empty-state">No applications yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="admin-stat"><span>{label}</span><strong>{value}</strong></div>;
}