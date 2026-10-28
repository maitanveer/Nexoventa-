"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Trash2 } from "lucide-react";
import { updateApplicationStatus } from "@/app/admin/actions";
import { PaymentReviewControls } from "@/components/admin/payment-review-controls";
import type { ApplicationStatus } from "@/lib/generated/prisma/enums";
import { whatsappUrlForNumber } from "@/lib/whatsapp";

export type AdminApplicationRow = {
  id: string;
  student: { fullName: string; phone: string; email: string };
  batch: { identifier: string; startTime: string; endTime: string; course: { name: string; fee: string | null } };
  payment: null | { id: string; status: string; courseFee: string | null; method: string | null; amount: string | null; transactionReference: string | null; paymentDate: string | null; submittedAt: string | null; reviewedAt: string | null; reviewedBy: string | null; receiptAvailable: boolean; rejectionReason: string | null };
  appliedAt: string;
  status: ApplicationStatus;
};

const applicationStatuses: ApplicationStatus[] = ["PENDING", "CANCELLED", "WAITLISTED"];

export function ApplicationTable({ applications, returnTo }: { applications: AdminApplicationRow[]; returnTo: string }) {
  const [rows, setRows] = useState(applications);
  const [pendingDelete, setPendingDelete] = useState<AdminApplicationRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const selectedApplications = rows.filter((application) => selectedIds.includes(application.id));
  const allRowsSelected = rows.length > 0 && selectedApplications.length === rows.length;
  const someRowsSelected = selectedApplications.length > 0 && !allRowsSelected;

  useEffect(() => {
    setRows(applications);
    setSelectedIds([]);
  }, [applications]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someRowsSelected;
  }, [someRowsSelected]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if ((pendingDelete || bulkDeleteOpen) && dialog && !dialog.open) dialog.showModal();
    if (!pendingDelete && !bulkDeleteOpen && dialog?.open) dialog.close();
  }, [pendingDelete, bulkDeleteOpen]);

  async function deleteApplication() {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/admin/applications/${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "The application could not be deleted. Please try again.");

      setRows((current) => current.filter((application) => application.id !== pendingDelete.id));
      setSelectedIds((current) => current.filter((id) => id !== pendingDelete.id));
      setFeedback({ message: body?.message || "Student application deleted successfully.", type: "success" });
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "The application could not be deleted. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelectedApplications() {
    const applicationIds = selectedApplications.map((application) => application.id);
    if (applicationIds.length === 0) return;
    setBulkDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/admin/applications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationIds }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Selected applications could not be deleted.");

      const deletedIds = new Set(applicationIds);
      setRows((current) => current.filter((application) => !deletedIds.has(application.id)));
      setSelectedIds([]);
      setFeedback({ message: body?.message || "Selected student applications deleted successfully.", type: "success" });
      setBulkDeleteOpen(false);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Selected applications could not be deleted.");
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <>
      {feedback && <p className={`application-feedback ${feedback.type}`} role="status">{feedback.message}</p>}
      {selectedApplications.length > 0 && (
        <div className="application-selection-toolbar" aria-live="polite">
          <span>{selectedApplications.length} students selected</span>
          <button className="delete-selected-button" type="button" onClick={() => { setDeleteError(null); setBulkDeleteOpen(true); }}>
            <Trash2 size={15} /> Delete Selected
          </button>
        </div>
      )}
      <div className="admin-table-scroll">
        <table>
          <thead><tr><th className="application-select-cell"><label><input ref={selectAllRef} type="checkbox" checked={allRowsSelected} disabled={rows.length === 0 || bulkDeleting} onChange={(event) => setSelectedIds(event.currentTarget.checked ? rows.map((application) => application.id) : [])} /><span>Select All</span></label></th><th>Student</th><th>Training slot</th><th>Course / batch</th><th>Course fee</th><th>Payment</th><th>Payment status</th><th>Applied</th><th>Admission</th><th>Review actions</th></tr></thead>
          <tbody>
            {rows.map((application) => {
              const phoneUrl = whatsappUrlForNumber(application.student.phone);
              return (
                <tr key={application.id}>
                  <td className="application-select-cell"><input type="checkbox" checked={selectedIds.includes(application.id)} disabled={bulkDeleting} aria-label={`Select ${application.student.fullName}`} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedIds((current) => checked ? [...current, application.id] : current.filter((id) => id !== application.id)); }} /></td>
                  <td><strong>{application.student.fullName}</strong><small>{phoneUrl ? <a className="admin-phone-link" href={phoneUrl} target="_blank" rel="noopener noreferrer">{application.student.phone}</a> : application.student.phone} · {application.student.email}</small></td>
                  <td><span className="training-slot-badge">{application.batch.startTime} – {application.batch.endTime}</span></td>
                  <td>{application.batch.course.name}<small>{application.batch.identifier}</small></td>
                  <td>{application.payment?.courseFee ? `PKR ${application.payment.courseFee}` : application.batch.course.fee ? `PKR ${application.batch.course.fee}` : "Not set"}</td>
                  <td>{application.payment?.amount ? `PKR ${application.payment.amount}` : "Not submitted"}<small>{application.payment?.method?.replaceAll("_", " ") || ""}{application.payment?.transactionReference ? ` · ${application.payment.transactionReference}` : ""}</small></td>
                  <td><span className={`table-status status-${(application.payment?.status || "NOT_SUBMITTED").toLowerCase()}`}>{application.payment?.status?.replaceAll("_", " ") || "NOT SUBMITTED"}</span><small>{application.payment?.paymentDate ? `Paid ${new Date(application.payment.paymentDate).toLocaleDateString("en-GB")}` : ""}{application.payment?.submittedAt ? ` · Submitted ${new Date(application.payment.submittedAt).toLocaleDateString("en-GB")}` : ""}</small>{application.payment?.reviewedAt && <small>Reviewed {new Date(application.payment.reviewedAt).toLocaleDateString("en-GB")}{application.payment.reviewedBy ? ` by ${application.payment.reviewedBy}` : ""}</small>}{application.payment?.rejectionReason && <small>Reason: {application.payment.rejectionReason}</small>}</td>
                  <td>{new Date(application.appliedAt).toLocaleDateString("en-GB")}</td>
                  <td><span className={`table-status status-${application.status.toLowerCase()}`}>{application.status}</span></td>
                  <td>
                    <div className="application-row-actions">
                      {application.payment && <PaymentReviewControls paymentId={application.payment.id} status={application.payment.status} hasReceipt={application.payment.receiptAvailable} />}
                      {!(["CONFIRMED", "REJECTED"] as string[]).includes(application.status) && <form action={updateApplicationStatus} className="status-form">
                        <input type="hidden" name="id" value={application.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <select name="status" defaultValue={application.status} aria-label={`Update ${application.student.fullName} status`}>
                          {applicationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                        <button type="submit">Save</button>
                      </form>}
                      <details className="application-actions-menu">
                        <summary className="admin-action application-actions-trigger">Actions <ChevronDown size={14} /></summary>
                        <div className="application-actions-popover">
                          <button className="application-delete-action" type="button" aria-label={`Delete student application for ${application.student.fullName}`} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDeleteError(null); setPendingDelete(application); }}><Trash2 size={15} /> Delete Student</button>
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={10}><div className="empty-state">No applications match these filters.</div></td></tr>}
          </tbody>
        </table>
      </div>
      <dialog className="delete-confirmation" ref={dialogRef} aria-labelledby="delete-student-title" aria-describedby="delete-student-description" onCancel={(event) => { event.preventDefault(); if (!deletingId && !bulkDeleting) { setPendingDelete(null); setBulkDeleteOpen(false); } }}>
        <p className="eyebrow">Permanent action</p>
        <h2 id="delete-student-title">{bulkDeleteOpen ? "Delete Selected Students?" : "Delete Student?"}</h2>
        <p id="delete-student-description">{bulkDeleteOpen ? `This will permanently delete ${selectedApplications.length} selected student applications and remove student records that are no longer linked to an application. This action cannot be undone.` : "This will permanently delete this student's application and associated information. This action cannot be undone."}</p>
        {deleteError && <p className="delete-confirmation-error" role="alert">{deleteError}</p>}
        <div className="delete-confirmation-actions">
          <button className="admin-action" type="button" disabled={Boolean(deletingId) || bulkDeleting} onClick={() => { setPendingDelete(null); setBulkDeleteOpen(false); }}>Cancel</button>
          <button className="delete-permanently-button" type="button" disabled={Boolean(deletingId) || bulkDeleting} onClick={bulkDeleteOpen ? deleteSelectedApplications : deleteApplication}>{deletingId || bulkDeleting ? "Deleting..." : "Delete Permanently"}</button>
        </div>
      </dialog>
    </>
  );
}