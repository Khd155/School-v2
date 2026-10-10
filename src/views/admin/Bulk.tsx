import { DownloadIcon } from "../icons";
import { SCORE_BANDS, scoreBand } from "../../shared/format";

/** Selection bar for exporting several reports as one PDF (wired up in admin.ts). */
export function BulkBar({ max }: { max: number }) {
  return (
    <div class="bulk-bar" id="bulk-bar" data-max={String(max)}>
      <p class="bulk-count" id="bulk-count" aria-live="polite">
        لم يُحدَّد أي طالب
      </p>
      <button type="button" class="btn btn-primary btn-sm" id="bulk-export" disabled>
        <span class="spinner" aria-hidden="true" hidden></span>
        <span class="btn-icon">
          <DownloadIcon />
        </span>
        <span class="btn-label">تصدير التقارير PDF</span>
      </button>
      <div id="bulk-message" class="bulk-message" aria-live="polite"></div>
    </div>
  );
}

export function SelectAllHeader() {
  return (
    <th class="select-cell">
      <input type="checkbox" data-bulk-all aria-label="تحديد كل الطلاب الظاهرين" />
    </th>
  );
}

export function SelectCell({ email, name }: { email: string; name: string }) {
  return (
    <td class="select-cell">
      <input type="checkbox" data-bulk-email={email} aria-label={`تحديد ${name}`} />
    </td>
  );
}

/** Final total with its colour band. */
export function BandedScore({ value, text }: { value: number | null; text: string }) {
  const band = scoreBand(value);
  return <span class={band ? `score-band score-band-${band}` : "muted"}>{text}</span>;
}

export function BandLegend() {
  return (
    <ul class="band-legend" aria-label="ألوان المجموع النهائي">
      {SCORE_BANDS.map((b) => (
        <li>
          <span class={`band-dot score-band-${b.band}`} aria-hidden="true"></span>
          {b.label}
        </li>
      ))}
    </ul>
  );
}
