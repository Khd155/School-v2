import { PageHead } from "./AdminLayout";
import { SCORE_FIELDS } from "../../server/analysis";
import { formatDateTimeRiyadh } from "../../shared/format";
import { isPeriodKey } from "../../shared/periods";
import type { PeriodInfo } from "../../server/periods";

type Props = { periods: PeriodInfo[]; flash: string | null };

/** The four periods of the school year: what parents see, and each period's maximum grades. */
export function PeriodsContent({ periods, flash }: Props) {
  const saved = isPeriodKey(flash) ? flash : null;
  return (
    <>
      <PageHead title="الفترات">
        العام الدراسي فصلان، في كل فصل فترتان. لكل فترة بياناتها ودرجاتها العظمى، وتختار أنت متى تظهر لأولياء الأمور. إذا ظهرت أكثر من فترة يختار ولي الأمر بينها في التقرير.
      </PageHead>
      {periods.map((p) => (
        <PeriodForm period={p} saved={saved === p.key} />
      ))}
    </>
  );
}

function PeriodForm({ period: p, saved }: { period: PeriodInfo; saved: boolean }) {
  const id = `period-${p.key}`;
  const hasData = p.activeDatasetId !== null;
  return (
    <form class="panel admin-section period-form" aria-labelledby={`${id}-title`} data-period={p.key} novalidate>
      <input type="hidden" name="key" value={p.key} />
      <div class="admin-section-head">
        <div>
          <h2 id={`${id}-title`}>{p.label}</h2>
          <p>
            {hasData
              ? `${p.studentCount ?? 0} طالبًا · آخر تحديث ${p.dataUpdatedAt ? formatDateTimeRiyadh(p.dataUpdatedAt) : "—"}`
              : "لا توجد بيانات معتمدة. اختر هذه الفترة من «بيانات الطلاب» لرفع ملفها."}
          </p>
        </div>
      </div>

      <label class="check">
        <input type="checkbox" name="visible" value="1" checked={p.visible} aria-describedby={`${id}-visible-hint`} />
        <span>
          <span class="check-label">ظاهرة لأولياء الأمور</span>
          <span class="hint" id={`${id}-visible-hint`}>
            {hasData ? "عند الإخفاء لا يراها ولي الأمر، وتبقى متاحة لك في اللوحة." : "لن تظهر حتى تُعتمد بياناتها، حتى لو كانت مفعّلة."}
          </span>
        </span>
      </label>

      <h3 class="issues-head period-max-head">الدرجات العظمى</h3>
      <p class="hint" style="margin-bottom: var(--space-3)">
        تظهر في التقرير بجانب كل درجة («8 من 15») ويُلوَّن حسبها. اترك الخانة فارغة لإخفاء «من» لذلك البند.
      </p>
      <div class="max-grid">
        {SCORE_FIELDS.map((f) => {
          const inputId = `${id}-max_${f.key}`;
          const value = p.scoreMax[f.key];
          return (
            <div class="field">
              <label class="label" for={inputId}>
                {f.label}
              </label>
              <input id={inputId} name={`max_${f.key}`} class="input num" inputmode="decimal" value={value !== null ? String(value) : ""} maxlength={6} />
              <p class="field-error" data-error-for={`max_${f.key}`} hidden></p>
            </div>
          );
        })}
      </div>

      <div class="period-form-footer">
        <p class={`form-status${saved ? " is-success" : ""}`} role="status" data-form-status>
          {saved ? "حُفظت إعدادات هذه الفترة." : ""}
        </p>
        <button type="submit" class="btn btn-primary">
          <span class="spinner" aria-hidden="true" hidden></span>
          <span class="btn-label">حفظ</span>
        </button>
      </div>
    </form>
  );
}
