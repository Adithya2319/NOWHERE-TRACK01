import { useMemo, useState } from 'react';
import { COMPONENTS, SCHEME_SOURCE } from '../config/vesit';
import { api } from '../services/api';
import { DEMO_POLICY, cumulativeResult, planSemester, validatePolicy, validateSemester } from '../../shared/planner';

const panel = 'min-w-0 rounded-2xl border border-ink/15 bg-white/50 p-4 sm:p-6';
const input = 'min-w-0 max-w-full rounded-lg border border-ink/25 bg-paper px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss disabled:opacity-60';
const button = `${input} min-h-11 whitespace-normal text-sm font-semibold hover:bg-ink/5 disabled:cursor-wait`;
const primary = 'min-h-11 max-w-full whitespace-normal rounded-lg bg-moss px-4 py-2 font-semibold text-white hover:bg-ink disabled:opacity-50';
const fmt = value => value == null ? 'Pending' : value.toFixed(2);
const planningValue = (value, status) => value != null ? fmt(value) : ({
  'insufficient-data': 'Insufficient data',
  'missing-rules': 'Missing grading rules',
  'unsupported-rules': 'Unsupported rules',
  'no-credits': 'No credited subjects',
}[status] || 'Pending');
const describeProjection = projection => projection.grade
  ? `Subject projection: ${projection.grade.grade} · ${projection.finalPercentage.toFixed(2)}%. ${projection.assumptions} ${projection.gateFailures.join('; ')}`
  : projection.status === 'insufficient-data'
    ? 'Insufficient data: no assessed components or what-if estimates for this subject.'
    : `${planningValue(null, projection.status)}. ${projection.assumptions}`;
const clone = value => JSON.parse(JSON.stringify(value));
const isEmpty = record => !Object.values(record.marks || {}).some(marks => Object.values(marks).some(value => value != null && value !== '')) && !(record.events || []).length && !Object.values(record.attendance || {}).some(entry => entry.total > 0);
const removeEstimate = (estimates, code, component) => {
  const remaining = { ...(estimates[code] || {}) };
  delete remaining[component];
  const next = { ...estimates };
  if (Object.keys(remaining).length) next[code] = remaining;
  else delete next[code];
  return next;
};

export default function AcademicPage({ data, onRefresh }) {
  const [semester, setSemester] = useState(1);
  const source = data.academics.semesters[semester];
  const [draftRecord, setDraft] = useState(null);
  const [draftPolicy, setPolicy] = useState(null);
  const draft = draftRecord || source;
  const policy = draftPolicy || data.academics.policy;
  const [dirty, setDirty] = useState(false);
  const [editRecorded, setEditRecorded] = useState(false);
  const [whatIf, setWhatIf] = useState({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [policyText, setPolicyText] = useState('');
  const [legacy, setLegacy] = useState(null);
  const [planningMode, setPlanningMode] = useState('auto');
  const result = useMemo(() => planSemester(draft, policy, { planningMode }), [draft, policy, planningMode]);
  const simulated = useMemo(() => planSemester({ ...draft, marks: Object.fromEntries(draft.courses.map(course => {
    const recorded = draft.marks[course.code] || {};
    const estimates = Object.fromEntries(Object.entries(whatIf[course.code] || {}).filter(([key, value]) => (recorded[key] == null || recorded[key] === '') && value != null && value !== ''));
    return [course.code, { ...recorded, ...estimates }];
  })) }, policy, { planningMode }), [draft, policy, whatIf, planningMode]);
  const stale = dirty && source.version !== draft.version;
  const demo = policy.mode === 'demo';
  const hasWhatIf = Object.keys(whatIf).length > 0;
  const savedCGPA = JSON.stringify(policy) === JSON.stringify(data.academics.policy) ? cumulativeResult(data.academics.semesters, data.academics.policy) : null;
  const subjectProjections = Object.fromEntries(simulated.rows.map(row => [row.course.code, row.projected]));
  const projectionCoverage = simulated.projectionCoverage;
  const samplePlanning = result.planningBasis?.mode === 'sample';

  const update = change => { setDraft(previous => ({ ...(previous || source), ...change, confirmed: false })); setDirty(true); setMessage(''); };
  const chooseSemester = number => {
    setSemester(number); setDraft(null); setPolicy(null);
    setDirty(false); setWhatIf({}); setEditRecorded(false); setError(''); setMessage(''); setLegacy(null); setPolicyText('');
  };
  const save = async () => {
    setError(''); setMessage('');
    try {
      validateSemester(draft); validatePolicy(policy); setPending(true);
      await api('/api/academics', { method: 'POST', body: { semester, record: draft, version: draft.version, policy } });
      await onRefresh(); setDraft(null); setPolicy(null); setDirty(false); setEditRecorded(false); setMessage('Recorded marks, target and policy saved to your account.');
    } catch (failure) { setError(failure.status === 409 ? 'This semester changed in another session. Reload the saved semester before editing again.' : failure.message); }
    finally { setPending(false); }
  };
  const mark = (course, key, text) => {
    const value = text === '' ? null : Number(text);
    if (value != null && (!Number.isFinite(value) || value < 0 || value > course.maxima[key] || !Number.isInteger(value * 2))) {
      setError(`${course.code} ${key}: enter 0–${course.maxima[key]} in half-mark increments, or leave blank.`);
      return;
    }
    setError('');
    setWhatIf(previous => removeEstimate(previous, course.code, key));
    update({ marks: { ...draft.marks, [course.code]: { ...(draft.marks[course.code] || {}), [key]: value } } });
  };
  const previewLegacy = () => {
    setError('');
    try {
      const parsed = JSON.parse(localStorage.getItem('campus360-vesit-r26-v1') || 'null');
      const saved = parsed?.semesters?.[semester];
      if (!saved) throw Error('No earlier local academic record was found for this semester.');
      validateSemester(saved);
      setLegacy(saved);
    } catch (failure) { setError(failure.message); }
  };
  const importLegacy = async () => {
    setError(''); setMessage(''); setPending(true);
    try {
      if (!legacy || !isEmpty(source)) throw Error('Legacy import is allowed only into an empty saved semester.');
      const imported = { ...legacy, confirmed: false };
      validateSemester(imported);
      await api('/api/academics/import', { method: 'POST', body: { semesters: { [semester]: imported }, confirm: true } });
      await onRefresh(); setDraft(null); setPolicy(null); setDirty(false); setLegacy(null); setMessage('Earlier marks and attendance imported. The original browser copy is unchanged.');
    } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  };

  return <div className="academic-planner min-w-0 space-y-5 pb-16">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0"><p className="font-mono text-xs uppercase tracking-widest text-ink/60">Your private academic records</p><h1 className="font-display text-4xl sm:text-5xl">Academic planner</h1></div>
      <label className="flex w-full min-w-0 flex-col gap-2 text-sm sm:w-auto sm:flex-row sm:items-center">Semester <select className={`${input} w-full sm:w-auto`} aria-label="Academic semester" value={semester} disabled={pending || dirty} onChange={event => chooseSemester(Number(event.target.value))}><option value={1}>1 · 18 credits</option><option value={2}>2 · 24 credits</option></select></label>
    </header>

    {data.me?.demo && <p className="rounded-lg border border-ochre/50 p-3 text-sm">DEMO assessment marks for presentation. Unfinished final assessments stay blank; sample grade/pass rules and projected results are illustrative.</p>}

    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl">Assessment rules</h2><label className="flex w-full min-w-0 flex-col gap-2 text-sm sm:w-auto sm:flex-row sm:items-center">Rule mode <select aria-label="Assessment rule mode" className={`${input} w-full sm:w-auto`} value={demo ? 'demo' : 'official'} disabled={pending} onChange={event => { setDraft(previous => ({ ...(previous || clone(source)), confirmed: false })); setPolicyText(''); setPolicy(event.target.value === 'demo' ? clone(DEMO_POLICY) : { source: '', confirmed: false, attendanceThreshold: null, gradeBands: [], passRules: {} }); setDirty(true); setMessage(''); }}><option value="official">Official VESIT · grades unverified</option><option value="demo">Sample planning rules</option></select></label></div>
      <p className="mt-3 text-sm">VESIT FE EXTC R26 subject names, maxima and credits are preserved from the <a href={SCHEME_SOURCE} target="_blank" rel="noreferrer" className="underline">published scheme</a>. Grade bands, passing rules and theory/practical grade aggregation still need an applicable official regulation.</p>
      <p className={`mt-3 rounded-lg p-3 text-sm ${demo ? 'bg-ochre/15' : 'bg-ink/5'}`}>{demo ? `Sample planning rules: ${policy.gradeBands.map(band => `${band.grade} ≥${band.min}% / ${band.points} points`).join('; ')}. These are not official VESIT rules. The sample uses 40% aggregate and component pass gates; inspect policy JSON for configured minima.` : policy.confirmed ? `User-confirmed policy source: ${policy.source}. Confirmation is not institutional verification.` : 'Recorded grades and CGPA await applicable saved grading and passing rules. Projections can use the separate, labelled sample planning basis below; this does not change your saved policy.'}</p>
      <p className="mt-2 text-xs text-ink/70">Published components are added once: mid-term and continuous assessment are separate in this scheme. A configured midtermIncludedInInternal course flag excludes mid-term from the total.</p>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Configure grade bands and pass minima</summary><p className="mt-2 text-xs">Pass minima are percentages of each component maximum. Rule changes are private to this account. Set confirmed only after checking an applicable regulation.</p><button className={`${button} my-3`} onClick={() => setPolicyText(JSON.stringify(policy, null, 2))}>Load policy JSON</button>{policyText !== '' && <><label className="block text-sm">Policy JSON<textarea aria-label="Academic policy JSON" className={`${input} mt-2 h-64 w-full font-mono text-xs`} value={policyText} onChange={event => setPolicyText(event.target.value)} /></label><button className={`${button} mt-2`} disabled={pending} onClick={() => { try { const parsed = JSON.parse(policyText); validatePolicy(parsed); setDraft(previous => ({ ...(previous || clone(source)), confirmed: false })); setPolicy(parsed); setDirty(true); setError(''); } catch (failure) { setError(failure.message); } }}>Apply policy to preview</button></>}</details>
    </section>

    <section className={panel} aria-labelledby="sgpa-outlook-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="sgpa-outlook-title" className="font-display text-2xl">SGPA outlook</h2>
        <label className="flex w-full min-w-0 flex-col gap-2 text-sm sm:w-auto">Projection grading basis
          <select aria-label="Projection grading basis" className={`${input} w-full`} value={planningMode} onChange={event => setPlanningMode(event.target.value)}>
            <option value="auto">Configured rules or sample fallback</option>
            <option value="configured">Configured rules only</option>
            <option value="sample">Sample planning rules only</option>
          </select>
        </label>
      </div>
      <p className={`mb-4 rounded-lg p-3 text-sm ${samplePlanning ? 'bg-ochre/15' : 'bg-ink/5'}`}>
        Planning basis: <strong>{samplePlanning ? 'Sample planning rules — not official VESIT rules' : 'Configured grading and passing rules'}</strong>.
        {result.planningBasis?.fallback && ' Saved grading rules are missing, incomplete or unconfirmed, so only planning results use the sample fallback.'}
        {' '}Recorded SGPA and confirmed CGPA always use your saved policy. This selector does not save policy changes.
      </p>
      {!!result.planningBasis?.issues?.length && <details className="mb-4 text-sm"><summary className="cursor-pointer font-semibold">Grading configuration details</summary><ul className="mt-2 list-disc space-y-1 pl-5">{result.planningBasis.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">{[
        ['Recorded SGPA', fmt(result.currentSGPA)],
        ['Projected SGPA', planningValue(simulated.projectedSGPA, simulated.projectionStatus)],
        ['Maximum reachable SGPA', planningValue(result.maxSGPA, result.maximumStatus)],
        [data.academics.policy.mode === 'demo' ? 'Confirmed CGPA · sample rules' : 'Confirmed CGPA', fmt(savedCGPA)],
        ['Credit total', result.credits],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-ink/10 p-3"><p className="text-xs text-ink/70">{label}</p><p className={`mt-1 font-display ${typeof value === 'string' && value.length > 10 ? 'text-2xl' : 'text-3xl'}`}>{value}</p>{['Projected SGPA', 'Maximum reachable SGPA'].includes(label) && <p className="mt-2 text-xs text-ink/70">{samplePlanning ? 'Sample planning rules' : 'Configured rules'}</p>}</div>)}</div>
      {result.currentSGPA == null && <p className="mt-3 text-sm">Recorded SGPA stays pending until every credited subject has its required final results and supported saved grading and passing rules.</p>}
      {simulated.projectionStatus === 'insufficient-data' && <div className="mt-3 rounded-lg border border-ink/15 p-3 text-sm">
        <p>Full-semester projection needs data for every credited subject. Insufficient data for: {projectionCoverage.missingSubjects.map(course => `${course.subject} (${course.code})`).join('; ')}.</p>
        {simulated.partialProjectedSGPA != null && <p className="mt-2">Available-subject estimate: {fmt(simulated.partialProjectedSGPA)} across {projectionCoverage.estimatedCredits}/{projectionCoverage.totalCredits} credits; not a full-semester SGPA.</p>}
        <p className="mt-2">Enter an assessed result or a deliberate what-if estimate for each missing subject. Unassessed subjects are not treated as zero or silently dropped from semester SGPA.</p>
      </div>}
      {hasWhatIf && <p className="mt-3 text-sm font-semibold">Projected SGPA includes your unsaved what-if estimates. Recorded SGPA and the maximum bound use recorded marks only.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-sm">Target SGPA <input aria-label="Target SGPA" type="number" min="0" max="10" step="0.1" className={`${input} ml-2 w-24`} value={draft.target ?? ''} disabled={pending} onChange={event => update({ target: event.target.value === '' ? null : Number(event.target.value) })} /></label><p className="text-sm font-semibold">{result.targetReachable == null ? 'Target feasibility pending rules / target.' : result.targetReachable ? 'Target is mathematically reachable under these rules.' : 'Target is unreachable with recorded marks and pass gates.'}</p></div>
      <p className="mt-3 text-xs text-ink/70">For each subject, the projection assumes your percentage on assessed components continues into every remaining component: projected mark = component maximum × assessed earned marks / assessed maximum. Each projected component rounds to the nearest half mark, with exact ties upward; grade cutoffs use the resulting unrounded total percentage. Applicable component, theory and aggregate pass gates still apply. No assessed marks means insufficient data, unless you deliberately enter what-if estimates.</p>
      <p className="mt-2 text-xs text-ink/70">SGPA = sum(subject credits × grade points) / total credited subjects' credits. Failed subjects keep their credits and receive zero points; zero-credit subjects are excluded. The maximum bound assumes full marks in all remaining components, including unassessed subjects, while preserving recorded marks and pass failures. It is an upper bound, not a prediction. These calculations use combined subject totals; separate theory/practical grade units need a supported configuration.</p>
      <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">Bands and pass rules used for planning</summary><p className="mt-2">{result.planningPolicy?.gradeBands?.map(band => `${band.grade} ≥${band.min}% / ${band.points} points`).join('; ') || 'No usable grade bands.'}</p><pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-ink/5 p-3">{JSON.stringify(result.planningPolicy?.passRules || {}, null, 2)}</pre></details>
      <p className="mt-2 text-xs text-ink/70">Confirmed CGPA weights credits across saved, complete semesters explicitly confirmed against issued results. Unconfirmed semesters and unsaved edits are excluded. It remains pending without applicable rules or while a policy change is unsaved; results under sample rules remain estimates.</p>
    </section>

    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl">Recorded marks</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editRecorded} disabled={pending} onChange={event => setEditRecorded(event.target.checked)} /> Edit recorded values</label></div>
      <p className="my-3 text-sm">These values are saved assessment records. Blank means unassessed; zero means an actual zero. Use half-mark increments. Recorded values are locked in what-if planning; deliberately enable editing here to correct them.</p>
      <div className="min-w-0 overflow-x-auto"><table role="table" aria-label="Recorded marks by course" className="academic-table academic-recorded-table w-full text-left text-sm">
        <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col" className="p-2">Course / credits</th>{Object.entries(COMPONENTS).map(([key, label]) => <th role="columnheader" scope="col" key={key} className="p-2">{label}</th>)}<th role="columnheader" scope="col" className="p-2">Result</th></tr></thead>
        <tbody role="rowgroup">{result.rows.map(row => <tr role="row" className="border-t border-ink/10" key={row.course.code}>
          <th role="rowheader" scope="row" className="academic-course p-2 font-medium xl:min-w-52">{row.course.subject}<span className="mt-1 block text-xs font-normal text-ink/60">{row.course.code} · {row.course.credits} credits</span></th>
          {Object.entries(COMPONENTS).map(([key, label]) => <td role="cell" className="p-2" key={key}>
            <span className="academic-mobile-label">{label}</span>
            {row.course.maxima[key] != null ? <><input aria-label={`${row.course.code} recorded ${label}`} type="number" min="0" max={row.course.maxima[key]} step="0.5" value={draft.marks[row.course.code]?.[key] ?? ''} className={`${input} w-20`} disabled={!editRecorded || pending} onChange={event => mark(row.course, key, event.target.value)} /><span className="mt-1 block text-xs text-ink/60">/ {row.course.maxima[key]}</span></> : <span aria-label={`${label}: not applicable`}>—</span>}
          </td>)}
          <td role="cell" className="academic-result p-2 xl:min-w-40"><span className="academic-mobile-label">Result</span><strong>{row.actual.grade?.grade ?? 'Grade pending'}</strong><span className="block text-xs">{row.actual.percentage == null ? 'No recorded marks' : `${row.actual.percentage.toFixed(1)}% of assessed components`}</span><span className="block text-xs">{row.actual.coverage.toFixed(0)}% assessed</span>{row.actual.gateFailures.map(failure => <span key={failure} className="mt-1 block text-xs text-signal">Pass gate: {failure}</span>)}</td>
        </tr>)}</tbody>
      </table></div>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.confirmed)} disabled={pending || result.currentSGPA == null} onChange={event => { setDraft(previous => ({ ...(previous || source), confirmed: event.target.checked })); setDirty(true); }} /> Confirm this complete semester against my issued result {demo ? '(sample grades remain estimates)' : ''}</label>
    </section>

    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl">What-if & grade requirements</h2><button className={button} disabled={!hasWhatIf} onClick={() => setWhatIf({})}>Reset what-if estimates</button></div><p className="my-3 text-sm">Estimates change the projected SGPA only and are never saved as recorded marks. Every required score is in half marks and includes applicable pass gates. Multiple missing assessments must also satisfy their individual component minima.</p>
      {result.rows.map(row => <details key={row.course.code} className="min-w-0 border-t border-ink/10 py-3"><summary className="cursor-pointer font-semibold">{row.course.subject} <span className="font-normal text-ink/60">· maximum {row.maximum.grade?.grade ?? 'pending rules'}</span></summary><div className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">{Object.entries(row.course.maxima).map(([key, maximum]) => {
        const recorded = draft.marks[row.course.code]?.[key]; const locked = recorded != null && recorded !== '';
        const includedInInternal = key === 'midterm' && row.course.midtermIncludedInInternal === true;
        return <label key={key} className="min-w-0 text-xs">{COMPONENTS[key] || key} · {includedInInternal ? 'included in continuous assessment' : locked ? 'recorded / locked' : 'estimate'}<input aria-label={`${row.course.code} what-if ${key}`} className={`${input} mt-1 block min-h-11 w-full`} type="number" min="0" max={maximum} step="0.5" disabled={locked || includedInInternal || pending} value={locked ? recorded : whatIf[row.course.code]?.[key] ?? ''} placeholder={`/ ${maximum}`} onChange={event => { const value = event.target.value === '' ? null : Number(event.target.value); if (value != null && (!Number.isFinite(value) || value < 0 || value > maximum || !Number.isInteger(value * 2))) return; setWhatIf(previous => value == null ? removeEstimate(previous, row.course.code, key) : ({ ...previous, [row.course.code]: { ...previous[row.course.code], [key]: value } })); }} /></label>;
      })}</div><p className="mt-3 text-sm" aria-live="polite">{describeProjection(subjectProjections[row.course.code])}</p>{row.requirements.length ? <div className="mt-4 min-w-0 overflow-x-auto"><table role="table" aria-label={`${row.course.subject} grade requirements`} className="academic-table academic-requirements-table w-full text-left text-sm"><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col" className="p-2">At least grade</th><th role="columnheader" scope="col" className="p-2">Required remaining marks</th><th role="columnheader" scope="col" className="p-2">Gate / lock explanation</th></tr></thead><tbody role="rowgroup">{row.requirements.map(requirement => <tr role="row" key={requirement.grade} className="border-t border-ink/10"><th role="rowheader" scope="row" className="p-2"><span className="academic-mobile-label">At least grade</span>{requirement.grade} · {requirement.points} points</th><td role="cell" className="p-2"><span className="academic-mobile-label">Required remaining marks</span>{requirement.required == null ? 'Pending / gate locked' : `${requirement.required} / ${requirement.remainingMax}`}<span className={`ml-2 text-xs ${requirement.reachable === false ? 'text-signal' : 'text-moss'}`}>{requirement.reachable == null ? 'Pending' : requirement.reachable ? requirement.locked ? 'Recorded / reached' : 'Reachable' : 'Locked / unreachable'}</span></td><td role="cell" className="p-2 text-xs xl:min-w-64"><span className="academic-mobile-label">Gate / lock explanation</span>{requirement.reason}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-ink/60">Required-grade table awaits applicable rules or selection of sample planning rules.</p>}</details>)}
    </section>

    <section className={panel}><h2 className="font-display text-2xl">Save & preserve records</h2><p className="my-3 text-sm">Saved academic records belong to this authenticated account and persist on the server. Earlier browser records stay unchanged in localStorage, including after a deliberate import.</p><div className="academic-actions flex flex-wrap gap-3"><button className={primary} disabled={!dirty || pending || stale} onClick={save}>{pending ? 'Saving…' : 'Save recorded marks & target'}</button><button className={button} disabled={pending} onClick={() => { setDirty(false); setDraft(null); setPolicy(null); setWhatIf({}); setEditRecorded(false); setError(''); setLegacy(null); setPolicyText(''); setMessage('Saved semester loaded.'); }}>Reload saved semester</button><button className={button} onClick={() => { const blob = new Blob([JSON.stringify({ semester, semesters: data.academics.semesters, policy: data.academics.policy }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'campus360-academic-backup.json'; link.click(); URL.revokeObjectURL(url); }}>Export saved backup</button><button className={button} onClick={previewLegacy}>Preview earlier browser records</button></div>{dirty && <p className="mt-3 text-sm font-semibold">Unsaved changes. Save or reload before changing semester.</p>}{stale && <p role="alert" className="mt-3 text-signal">A newer saved version exists. Reload before editing again.</p>}{legacy && <div className="mt-4 rounded-lg border border-ink/20 p-3 text-sm"><p>Legacy semester {semester}: {Object.values(legacy.marks || {}).reduce((count, marks) => count + Object.values(marks).filter(value => value != null && value !== '').length, 0)} marks, {(legacy.events || []).length} dated attendance records, {Object.values(legacy.attendance || {}).reduce((sum, entry) => sum + entry.total, 0)} counted lectures.</p><p className="mt-2">{isEmpty(source) ? 'Import this preview into your current authenticated account? This action copies the selected semester only and leaves the original browser record unchanged.' : 'Import is blocked because this account already has academic records; existing data will not be overwritten.'}</p><button className={`${button} mt-3`} disabled={pending || dirty || !isEmpty(source)} onClick={importLegacy}>Import preview into empty account semester</button></div>}{message && <p role="status" className="mt-3 text-moss">{message}</p>}{error && <p role="alert" className="mt-3 text-signal">{error}</p>}</section>
  </div>;
}
