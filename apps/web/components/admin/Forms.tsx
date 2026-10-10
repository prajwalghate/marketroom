import clsx from 'clsx';
import type { EvidenceRef, FieldSpec, ReviewStatus, ReviewTarget } from '@marketroom/db';
import { SOURCE_KINDS } from '@marketroom/db';
import {
  confirmEvidenceAction,
  removeEvidenceAction,
  reviewAction,
  unlockAction,
} from '@/app/admin/actions';
import { methodLabel, sourceKindLabel } from '@/components/research/Evidence';
import { fmtDay } from '@/components/research/format';

/**
 * Form pieces for the editors' dashboard. Plain forms posting to server
 * actions: they work without client JavaScript, and every one carries `back`
 * so the editor returns to where they were.
 */

export function Back({ to }: { to: string }) {
  return <input type="hidden" name="back" value={to} />;
}

/** Confirm, flag or reject a record or connection. */
export function ReviewButtons({
  target,
  id,
  status,
  back,
  compact,
}: {
  target: ReviewTarget;
  id: number;
  status: ReviewStatus;
  back: string;
  compact?: boolean;
}) {
  const button = (next: ReviewStatus, label: string, cls: string) => (
    <form action={reviewAction} className="rx-inline-form">
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <Back to={back} />
      <button type="submit" className={`rx-btn ${cls}`} disabled={status === next}>
        {label}
      </button>
    </form>
  );
  return (
    <span className="rx-review-buttons">
      {button('verified', compact ? '✓ Confirm' : '✓ Mark checked', 'is-ok')}
      {status !== 'needs_review' && button('needs_review', 'Flag', 'is-quiet')}
      {button('rejected', 'Reject', 'is-danger')}
    </span>
  );
}

/** "Where does this come from?" — the source fields every edit can carry. */
export function SourceFields({
  required,
  label = 'Source for this change',
  kinds,
}: {
  required?: boolean;
  label?: string;
  kinds?: readonly string[];
}) {
  return (
    <fieldset className="rx-fieldset">
      <legend>{label}</legend>
      <div className="rx-field-row">
        <label className="rx-field is-wide">
          <span>Link{required ? '' : ' (recommended)'}</span>
          <input type="url" name="sourceUrl" placeholder="https://…" required={required} />
        </label>
        <label className="rx-field">
          <span>Type</span>
          <select name="sourceKind" defaultValue="">
            <option value="">Detect from the link</option>
            {(kinds ?? SOURCE_KINDS).map((k) => (
              <option key={k} value={k}>
                {sourceKindLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="rx-field is-wide">
        <span>Note (optional)</span>
        <input
          type="text"
          name="sourceNote"
          placeholder="What in the source supports this"
          maxLength={300}
        />
      </label>
    </fieldset>
  );
}

/** One editable field, with its lock state and its sources. */
export function FieldInput({
  spec,
  value,
  locked,
  evidence,
  projects,
  type,
  id,
  back,
}: {
  spec: FieldSpec;
  value: unknown;
  locked: boolean;
  evidence: readonly EvidenceRef[];
  projects?: readonly { id: number; name: string }[];
  type: string;
  id: number;
  back: string;
}) {
  const name = `f_${spec.key}`;
  const text =
    value === null || value === undefined
      ? ''
      : Array.isArray(value)
        ? value.join(', ')
        : String(value);
  let input;
  switch (spec.kind) {
    case 'textarea':
      input = <textarea name={name} defaultValue={text} rows={4} />;
      break;
    case 'select':
      input = (
        <select name={name} defaultValue={text}>
          <option value="">—</option>
          {spec.options?.map((o) => (
            <option key={o} value={o}>
              {o.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      );
      break;
    case 'boolean':
      input = <input type="checkbox" name={name} defaultChecked={value === true} />;
      break;
    case 'project':
      input = (
        <select name={name} defaultValue={text}>
          <option value="">—</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      );
      break;
    case 'date':
      input = <input type="date" name={name} defaultValue={text.slice(0, 10)} />;
      break;
    case 'money':
    case 'number':
    case 'year':
      input = <input type="text" inputMode="decimal" name={name} defaultValue={text} />;
      break;
    default:
      input = <input type={spec.kind === 'url' ? 'url' : 'text'} name={name} defaultValue={text} />;
  }
  const own = evidence.filter((e) => e.field === spec.key);
  return (
    <div className={clsx('rx-field', spec.kind === 'textarea' && 'is-wide')}>
      <label>
        <span>
          {spec.label}
          {spec.required && <span aria-hidden="true"> *</span>}
          {locked && (
            <span className="rx-lock" title="Set by an editor; imports leave it alone">
              {' '}
              · locked
            </span>
          )}
        </span>
        {input}
      </label>
      {spec.help && <span className="rx-field-help">{spec.help}</span>}
      {own.length > 0 && (
        <span className="rx-field-help">
          Source:{' '}
          {own
            .map(
              (e) =>
                `${e.publisher ?? sourceKindLabel(e.kind)} (${methodLabel(e)}, ${fmtDay(e.checkedAt)})`,
            )
            .join('; ')}
        </span>
      )}
      {locked && (
        <form action={unlockAction} className="rx-inline-form">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="field" value={spec.key} />
          <Back to={back} />
          <button type="submit" className="rx-btn is-link">
            Let imports update it again
          </button>
        </form>
      )}
    </div>
  );
}

/** Evidence rows with confirm and remove. */
export function EvidenceTable({
  evidence,
  back,
}: {
  evidence: readonly EvidenceRef[];
  back: string;
}) {
  if (evidence.length === 0) return <p className="rx-empty">No sources attached yet.</p>;
  return (
    <div className="rx-table-wrap">
      <table className="rx-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Supports</th>
            <th>How</th>
            <th>Checked</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((e) => (
            <tr key={e.id}>
              <td>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rx-strong-link"
                >
                  {e.publisher ?? e.title ?? e.url}
                </a>
                <span className="rx-under">
                  {sourceKindLabel(e.kind)} · <span className="rx-url">{e.url}</span>
                </span>
              </td>
              <td>{e.field || 'the record'}</td>
              <td>
                {methodLabel(e)}
                {e.note && <span className="rx-under">{e.note}</span>}
              </td>
              <td className="mr-num">{fmtDay(e.checkedAt)}</td>
              <td>
                <span className="rx-review-buttons">
                  {e.method !== 'editor' && (
                    <form action={confirmEvidenceAction} className="rx-inline-form">
                      <input type="hidden" name="evidenceId" value={e.id} />
                      <Back to={back} />
                      <button type="submit" className="rx-btn is-ok">
                        ✓ I checked it
                      </button>
                    </form>
                  )}
                  <form action={removeEvidenceAction} className="rx-inline-form">
                    <input type="hidden" name="evidenceId" value={e.id} />
                    <Back to={back} />
                    <button type="submit" className="rx-btn is-danger">
                      Remove
                    </button>
                  </form>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
