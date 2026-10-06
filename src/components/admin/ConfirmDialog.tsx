"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Native <dialog>: focus trapping, Esc to close and backdrop come from the browser. */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = "primary", pending, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <div className="dialog-body">
        <h2 id="confirm-title">{title}</h2>
        {children}
      </div>
      <div className="dialog-actions">
        <button type="button" className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={pending}>
          {pending && <span className="spinner" aria-hidden="true" />}
          {confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>
          إلغاء
        </button>
      </div>
    </dialog>
  );
}
