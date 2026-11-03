import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function StudentsPage() {
  await requireAdmin();
  const students = await db.student.findMany({
    where: { applications: { some: { status: "CONFIRMED" } } },
    include: { _count: { select: { applications: { where: { status: "CONFIRMED" } } } } },
    orderBy: { createdAt: "desc" },
  });
  return <main className="admin-page"><div className="shell"><div className="admin-top"><div><p className="eyebrow">People</p><h1>Students</h1></div></div><div className="admin-table-wrap"><div className="admin-section-head"><div><p className="eyebrow">Student directory</p><h2>{students.length} students</h2></div></div><div className="admin-table-scroll"><table><thead><tr><th>Name</th><th>Contact</th><th>Education</th><th>Confirmed applications</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><strong>{student.fullName}</strong><small>{student.fatherName}</small></td><td><strong>{student.phone}</strong><small>{student.email}</small></td><td>{student.education}</td><td>{student._count.applications}</td></tr>)}</tbody></table></div></div></div></main>;
}
