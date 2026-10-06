import { $, post, setBusy, type ApiResult } from "./dom";

const csrf = () => document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";

/** Admin API call with the CSRF header; an expired session sends the user to the login page. */
export async function adminPost<T = Record<string, unknown>>(url: string, body: object | FormData): Promise<ApiResult<T>> {
  const res = await post<T>(url, body, { "x-csrf-token": csrf() });
  if (res.status === 401) window.location.assign("/admin/login");
  return res;
}

type ConfirmOptions = {
  title: string;
  body: string | Node;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** Return true to close the dialog. */
  action: () => Promise<boolean>;
};

/** Shows the shared native <dialog> (focus trap, Esc and backdrop come from the browser). */
export function confirmAction(opts: ConfirmOptions) {
  const dialog = $<HTMLDialogElement>("#confirm-dialog")!;
  const ok = $<HTMLButtonElement>("#confirm-ok")!;
  const cancel = $<HTMLButtonElement>("#confirm-cancel")!;
  $("#confirm-title")!.textContent = opts.title;
  $("#confirm-body")!.replaceChildren(opts.body);
  $(".btn-label", ok)!.textContent = opts.confirmLabel;
  ok.className = `btn ${opts.tone === "danger" ? "btn-danger" : "btn-primary"}`;
  let pending = false;

  const close = () => {
    dialog.close();
    ok.onclick = null;
    cancel.onclick = null;
    dialog.oncancel = null;
  };
  ok.onclick = async () => {
    pending = true;
    setBusy(ok, true);
    cancel.disabled = true;
    const done = await opts.action();
    setBusy(ok, false);
    cancel.disabled = false;
    pending = false;
    if (done) close();
  };
  cancel.onclick = () => !pending && close();
  dialog.oncancel = (e) => {
    e.preventDefault();
    if (!pending) close();
  };
  dialog.showModal();
}
