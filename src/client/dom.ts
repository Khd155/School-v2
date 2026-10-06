/** Small DOM helpers shared by the client bundles. All user-facing text is set via textContent. */

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

const ICONS = {
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  success: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
};

export type Tone = "error" | "warning" | "success" | "info";

/** Renders an alert into `container` (replacing its content). Pass null to clear. */
export function showAlert(container: Element | null, tone: Tone | null, title?: string, body?: string) {
  if (!container) return;
  container.replaceChildren();
  if (!tone) return;
  const box = document.createElement("div");
  box.className = `alert alert-${tone}`;
  box.setAttribute("role", tone === "error" ? "alert" : "status");
  const icon = tone === "success" ? ICONS.success : tone === "info" ? ICONS.info : ICONS.alert;
  box.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
  const text = document.createElement("div");
  if (title) {
    const strong = document.createElement("strong");
    strong.className = "alert-title";
    strong.textContent = title;
    text.append(strong);
  }
  if (body) text.append(body);
  box.append(text);
  container.append(box);
}

/** Toggles a button's loading state (spinner + optional label swap). */
export function setBusy(button: HTMLButtonElement | null, busy: boolean, busyLabel?: string) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  const spinner = $(".spinner", button);
  const icon = $(".btn-icon", button);
  const label = $(".btn-label", button);
  if (spinner) spinner.hidden = !busy;
  if (icon) icon.hidden = busy;
  if (!label) return;
  if (busy && busyLabel) {
    label.dataset.idle = label.textContent ?? "";
    label.textContent = busyLabel;
  } else if (!busy && label.dataset.idle !== undefined) {
    label.textContent = label.dataset.idle;
    delete label.dataset.idle;
  }
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; data: { error?: string; message?: string; retryAfterMinutes?: number; errors?: Record<string, string> } };

/** JSON/FormData POST. Never throws; status 0 means a network failure. */
export async function post<T = Record<string, unknown>>(url: string, body: object | FormData, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
  try {
    const isForm = body instanceof FormData;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...headers },
      body: isForm ? body : JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, status: res.status, data: data as T } : { ok: false, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

export const NETWORK_ERROR = "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.";

export function minutesLabel(n: number): string {
  return n >= 3 && n <= 10 ? `${n} دقائق` : `${n} دقيقة`;
}

/** Saves a Blob as a file download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
