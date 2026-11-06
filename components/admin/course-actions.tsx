"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteCourse } from "@/app/admin/actions";

export function PendingSubmitButton({
  children,
  pendingLabel,
  className = "admin-action primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function CourseDeleteConfirmation({
  courseId,
  courseName,
  batchCount,
}: {
  courseId: string;
  courseName: string;
  batchCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirming && dialog && !dialog.open) dialog.showModal();
    if (!confirming && dialog?.open) dialog.close();
  }, [confirming]);

  return (
    <>
      <button
        className="course-delete-trigger"
        type="button"
        aria-label={`Delete course ${courseName}`}
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
      <dialog
        className="delete-confirmation"
        ref={dialogRef}
        aria-labelledby={`delete-course-title-${courseId}`}
        aria-describedby={`delete-course-description-${courseId}`}
        onCancel={(event) => {
          event.preventDefault();
          setConfirming(false);
        }}
      >
        <p className="eyebrow">Permanent action</p>
        <h2 id={`delete-course-title-${courseId}`}>Delete course?</h2>
        <p id={`delete-course-description-${courseId}`}>
          You are deleting <strong>{courseName}</strong>. This cannot be undone. A course can only be deleted when it has no batches, applications, students, or payment history. Any linked records will block deletion and remain unchanged.
          {batchCount > 0 && ` This course currently has ${batchCount} ${batchCount === 1 ? "batch" : "batches"}.`}
        </p>
        <form action={deleteCourse}>
          <input type="hidden" name="id" value={courseId} />
          <div className="delete-confirmation-actions">
            <button className="admin-action" type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <PendingSubmitButton className="delete-permanently-button" pendingLabel="Checking records...">
              Delete course permanently
            </PendingSubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
