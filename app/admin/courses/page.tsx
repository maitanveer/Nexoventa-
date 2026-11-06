import { createCourse, toggleCourse, updateCourse, updateCourseFee } from "../actions";
import { CourseDeleteConfirmation, PendingSubmitButton } from "@/components/admin/course-actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const successMessages: Record<string, string> = {
  created: "Course created successfully.",
  updated: "Course updated. The new name is shown wherever this course is referenced.",
  deleted: "Unused course deleted successfully.",
  "fee-updated": "Course fee updated successfully.",
};

const errorMessages: Record<string, string> = {
  invalid: "Check the required fields and enter a valid course name, slug, duration, description, and fee.",
  "slug-taken": "That slug is already in use. Choose a different slug.",
  "not-found": "That course could not be found. Refresh the page and try again.",
  "course-not-found": "That course could not be found. Refresh the page and try again.",
  "course-in-use": "This course is linked to batches or historical application, student, or payment records. Nothing was deleted; deactivate the course to remove it from public listings.",
  "course-changed": "The course or its related records changed during this action. Refresh the page and try again.",
};

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const courses = await db.course.findMany({
    include: { _count: { select: { batches: true } } },
    orderBy: { createdAt: "desc" },
  });
  const successMessage = params.success ? successMessages[params.success] : undefined;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <AdminPage title="Courses" eyebrow="Catalog">
      {successMessage && <p className="application-feedback success" role="status">{successMessage}</p>}
      {errorMessage && <p className="admin-error-message" role="alert">{errorMessage}</p>}
      <form action={createCourse} className="admin-form">
        <Field label="Course name" name="name" maxLength={120} />
        <Field label="Slug" name="slug" maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <Field label="Duration" name="duration" maxLength={100} />
        <label className="field field-wide">
          <span>Description</span>
          <textarea name="description" rows={3} minLength={10} maxLength={2000} required />
        </label>
        <Field label="Fee (PKR, optional)" name="fee" type="number" required={false} min="0" max="99999999" step="0.01" />
        <PendingSubmitButton pendingLabel="Creating course...">Create course</PendingSubmitButton>
      </form>

      <div className="admin-table-wrap">
        <div className="admin-section-head">
          <div><p className="eyebrow">Course catalog</p><h2>All courses</h2></div>
        </div>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr><th>Name</th><th>Slug</th><th>Batches</th><th>Course fee</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td><strong>{course.name}</strong><small>{course.description}</small></td>
                  <td>{course.slug}</td>
                  <td>{course._count.batches}</td>
                  <td>
                    <form action={updateCourseFee} className="status-form">
                      <input type="hidden" name="id" value={course.id} />
                      <input className="course-fee-input" name="fee" type="number" min="0" max="99999999" step="0.01" defaultValue={course.fee?.toString() ?? ""} aria-label={`Course fee in PKR for ${course.name}`} placeholder="Not set" />
                      <PendingSubmitButton className="course-fee-submit" pendingLabel="Saving...">Save fee</PendingSubmitButton>
                    </form>
                  </td>
                  <td>{course.active ? "Active" : "Inactive"}</td>
                  <td>
                    <div className="course-row-actions">
                      <details className="course-editor">
                        <summary className="admin-action">Edit</summary>
                        <form action={updateCourse} className="admin-form course-editor-form">
                          <input type="hidden" name="id" value={course.id} />
                          <Field label="Course name" name="name" value={course.name} maxLength={120} />
                          <Field label="Slug" name="slug" value={course.slug} maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
                          <Field label="Duration" name="duration" value={course.duration} maxLength={100} />
                          <label className="field course-description-field">
                            <span>Description</span>
                            <textarea name="description" rows={4} minLength={10} maxLength={2000} defaultValue={course.description} required />
                          </label>
                          <Field label="Fee (PKR, optional)" name="fee" type="number" required={false} min="0" max="99999999" step="0.01" value={course.fee?.toString() ?? ""} />
                          <PendingSubmitButton pendingLabel="Saving changes...">Save changes</PendingSubmitButton>
                        </form>
                      </details>
                      <form action={toggleCourse}>
                        <input type="hidden" name="id" value={course.id} />
                        <PendingSubmitButton className="admin-action" pendingLabel="Updating...">
                          {course.active ? "Deactivate" : "Activate"}
                        </PendingSubmitButton>
                      </form>
                      <CourseDeleteConfirmation courseId={course.id} courseName={course.name} batchCount={course._count.batches} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}

function Field({
  label,
  name,
  required = true,
  type = "text",
  value,
  min,
  max,
  step,
  maxLength,
  pattern,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: "text" | "number";
  value?: string;
  min?: string;
  max?: string;
  step?: string;
  maxLength?: number;
  pattern?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} defaultValue={value} required={required} min={min} max={max} step={step} maxLength={maxLength} pattern={pattern} />
    </label>
  );
}

function AdminPage({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <main className="admin-page">
      <div className="shell">
        <div className="admin-top"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div></div>
        {children}
      </div>
    </main>
  );
}
