import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AcademicPage from './AcademicPage';
import { DEMO_POLICY } from '../../shared/planner';
import { api } from '../services/api';

vi.mock('../services/api', () => ({ api: vi.fn() }));

const course = { code: 'TEST101', subject: 'Synthetic test course', credits: 4, practicalCredits: 0, maxima: { internal: 40, endSem: 60 } };
const semester = () => ({ courses: [course], marks: { TEST101: { internal: 36 } }, attendance: {}, events: [], deadlines: [], target: 8, confirmed: false, version: 1 });
const data = () => ({ academics: { semesters: { 1: semester(), 2: semester() }, policy: structuredClone(DEMO_POLICY) }, config: {} });

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(cleanup);

describe('connected academic planner', () => {
  it('shows labeled confirmed CGPA under sample rules and excludes unsaved mark edits', () => {
    const saved = data();
    saved.academics.semesters[1].marks.TEST101.endSem = 54;
    saved.academics.semesters[1].confirmed = true;
    render(<AcademicPage data={saved} onRefresh={vi.fn()} />);
    const cumulativeCard = screen.getByText('Confirmed CGPA · sample rules').parentElement;
    expect(cumulativeCard).toHaveTextContent('10.00');
    fireEvent.click(screen.getByLabelText('Edit recorded values'));
    fireEvent.change(screen.getByLabelText('TEST101 recorded End semester'), { target: { value: '48' } });
    expect(cumulativeCard).toHaveTextContent('10.00');
    fireEvent.change(screen.getByLabelText('Assessment rule mode'), { target: { value: 'official' } });
    expect(cumulativeCard).toHaveTextContent('Pending');
  });

  it('clears obsolete policy JSON and result confirmation when rule mode changes', () => {
    const saved = data();
    saved.academics.semesters[1].marks.TEST101.endSem = 54;
    saved.academics.semesters[1].confirmed = true;
    render(<AcademicPage data={saved} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load policy JSON' }));
    expect(screen.getByLabelText('Academic policy JSON')).toHaveValue(JSON.stringify(DEMO_POLICY, null, 2));
    expect(screen.getByLabelText(/Confirm this complete semester/)).toBeChecked();
    fireEvent.change(screen.getByLabelText('Assessment rule mode'), { target: { value: 'official' } });
    expect(screen.queryByLabelText('Academic policy JSON')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm this complete semester/)).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved semester' }));
    expect(screen.getByLabelText(/Confirm this complete semester/)).toBeChecked();
    expect(screen.queryByLabelText('Academic policy JSON')).not.toBeInTheDocument();
  });

  it('keeps what-if values separate from saved recorded marks', async () => {
    const saved = data(); const onRefresh = vi.fn().mockResolvedValue(undefined); api.mockResolvedValue({ saved: true });
    render(<AcademicPage data={saved} onRefresh={onRefresh} />);
    expect(screen.getByLabelText('TEST101 recorded Continuous assessment')).toBeDisabled();
    expect(screen.getByLabelText('TEST101 what-if internal')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('TEST101 what-if endSem'), { target: { value: '60' } });
    expect(screen.getByLabelText('TEST101 recorded End semester')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Target SGPA'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save recorded marks & target' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    const [, request] = api.mock.calls[0];
    expect(request.body.record.marks.TEST101).toEqual({ internal: 36 });
    expect(request.body.record.target).toBe(9);
    expect(saved.academics.semesters[1].marks.TEST101).toEqual({ internal: 36 });
  });

  it('removes an old estimate when a recorded result replaces it', () => {
    render(<AcademicPage data={data()} onRefresh={vi.fn()} />);
    const projectedCard = screen.getByText('Projected SGPA').parentElement;
    fireEvent.change(screen.getByLabelText('TEST101 what-if endSem'), { target: { value: '60' } });
    expect(projectedCard).toHaveTextContent('10.00');
    fireEvent.click(screen.getByLabelText('Edit recorded values'));
    fireEvent.change(screen.getByLabelText('TEST101 recorded End semester'), { target: { value: '24' } });
    expect(screen.getByLabelText('TEST101 what-if endSem')).toBeDisabled();
    expect(screen.getByLabelText('TEST101 what-if endSem')).toHaveValue(24);
    expect(projectedCard).toHaveTextContent('7.00');
    expect(screen.getByRole('button', { name: 'Reset what-if estimates' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('TEST101 recorded End semester'), { target: { value: '' } });
    expect(screen.getByLabelText('TEST101 what-if endSem')).toHaveValue(null);
  });

  it('keeps refreshed recorded marks ahead of an earlier what-if estimate', () => {
    const original = data();
    const view = render(<AcademicPage data={original} onRefresh={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('TEST101 what-if endSem'), { target: { value: '60' } });
    const refreshed = data();
    refreshed.academics.semesters[1].marks.TEST101.endSem = 24;
    refreshed.academics.semesters[1].version = 2;
    view.rerender(<AcademicPage data={refreshed} onRefresh={vi.fn()} />);
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('7.00');
    expect(screen.getByLabelText('TEST101 what-if endSem')).toHaveValue(24);
  });

  it('clearing the last estimate clears the what-if state', () => {
    render(<AcademicPage data={data()} onRefresh={vi.fn()} />);
    const estimate = screen.getByLabelText('TEST101 what-if endSem');
    fireEvent.change(estimate, { target: { value: '0' } });
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('0.00');
    expect(screen.getByRole('button', { name: 'Reset what-if estimates' })).toBeEnabled();
    fireEvent.change(estimate, { target: { value: '' } });
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('10.00');
    expect(screen.getByRole('button', { name: 'Reset what-if estimates' })).toBeDisabled();
  });

  it('excludes a midterm estimate when the course already includes it in internal marks', () => {
    const saved = data();
    saved.academics.semesters[1].courses = [{ ...course, midtermIncludedInInternal: true, maxima: { midterm: 20, internal: 40, endSem: 60 } }];
    render(<AcademicPage data={saved} onRefresh={vi.fn()} />);
    expect(screen.getByLabelText('TEST101 what-if midterm')).toBeDisabled();
    expect(screen.getByLabelText('TEST101 what-if endSem')).toBeEnabled();
  });

  it('shows API failure honestly and preserves unsaved marks for retry', async () => {
    api.mockRejectedValue(new Error('Server unavailable. Please retry.'));
    render(<AcademicPage data={data()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Edit recorded values'));
    fireEvent.change(screen.getByLabelText('TEST101 recorded End semester'), { target: { value: '48.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save recorded marks & target' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server unavailable'));
    expect(screen.getByLabelText('TEST101 recorded End semester')).toHaveValue(48.5);
    expect(screen.queryByText('Recorded marks, target and policy saved to your account.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save recorded marks & target' })).toBeEnabled();
  });

  it('prevents stale saves when another session changes the semester', () => {
    const original = data();
    const view = render(<AcademicPage data={original} onRefresh={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Target SGPA'), { target: { value: '9' } });
    const newer = data(); newer.academics.semesters[1].version = 2;
    view.rerender(<AcademicPage data={newer} onRefresh={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('newer saved version');
    expect(screen.getByRole('button', { name: 'Save recorded marks & target' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved semester' }));
    expect(screen.getByLabelText('Target SGPA')).toHaveValue(8);
    expect(api).not.toHaveBeenCalled();
  });

  it('rejects invalid half-mark precision before issuing a save', () => {
    render(<AcademicPage data={data()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Edit recorded values'));
    fireEvent.change(screen.getByLabelText('TEST101 recorded End semester'), { target: { value: '10.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save recorded marks & target' }));
    expect(screen.getByRole('alert')).toHaveTextContent('half-mark increments');
    expect(api).not.toHaveBeenCalled();
  });

  it('imports a deliberate legacy preview only into an empty account and keeps the browser copy', async () => {
    const original = JSON.stringify({ semesters: { 1: semester() } });
    localStorage.setItem('campus360-vesit-r26-v1', original);
    const empty = data(); empty.academics.semesters[1].marks = {};
    api.mockResolvedValue({ imported: true });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<AcademicPage data={empty} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview earlier browser records' }));
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByText(/Legacy semester 1: 1 marks/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import preview into empty account semester' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith('/api/academics/import', expect.objectContaining({ body: expect.objectContaining({ confirm: true }) }));
    expect(localStorage.getItem('campus360-vesit-r26-v1')).toBe(original);
  });

  it('shows labelled sample projections with the default missing policy while recorded SGPA stays pending', () => {
    const saved = data();
    saved.academics.policy = { source: '', confirmed: false, attendanceThreshold: null, gradeBands: [], passRules: {} };
    render(<AcademicPage data={saved} onRefresh={vi.fn()} />);
    expect(screen.getByText('Recorded SGPA').parentElement).toHaveTextContent('Pending');
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('10.00');
    expect(screen.getByText('Maximum reachable SGPA').parentElement).toHaveTextContent('10.00');
    expect(screen.getByLabelText('Projection grading basis')).toHaveValue('auto');
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent(/sample/i);
    expect(screen.getByText('Maximum reachable SGPA').parentElement).toHaveTextContent(/sample/i);
    expect(screen.getByLabelText('Assessment rule mode')).toHaveValue('official');
    expect(screen.getByRole('button', { name: 'Save recorded marks & target' })).toBeDisabled();
    expect(api).not.toHaveBeenCalled();
  });

  it('allows strict configured planning and explicit sample planning without changing recorded rules', () => {
    const saved = data();
    saved.academics.policy = { source: '', confirmed: false, attendanceThreshold: null, gradeBands: [], passRules: {} };
    render(<AcademicPage data={saved} onRefresh={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Projection grading basis'), { target: { value: 'configured' } });
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('Missing grading rules');
    expect(screen.getByText('Maximum reachable SGPA').parentElement).toHaveTextContent('Missing grading rules');
    fireEvent.change(screen.getByLabelText('Projection grading basis'), { target: { value: 'sample' } });
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('10.00');
    expect(screen.getByText('Recorded SGPA').parentElement).toHaveTextContent('Pending');
    expect(screen.getByLabelText('Assessment rule mode')).toHaveValue('official');
    expect(saved.academics.policy.gradeBands).toEqual([]);
    expect(api).not.toHaveBeenCalled();
  });

  it('shows insufficient data and credit coverage instead of treating an unmarked subject as a full forecast', () => {
    const saved = data();
    saved.academics.semesters[1].courses.push({ ...course, code: 'UNASSESSED', subject: 'Not assessed yet', credits: 2 });
    render(<AcademicPage data={saved} onRefresh={vi.fn()} />);
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('Insufficient data');
    expect(screen.getByText(/Available-subject estimate:/)).toHaveTextContent('10.00 across 4/6 credits; not a full-semester SGPA.');
    expect(screen.getByText('Maximum reachable SGPA').parentElement).toHaveTextContent('10.00');
    expect(screen.getByText('Recorded SGPA').parentElement).toHaveTextContent('Pending');
    expect(screen.getAllByText(/UNASSESSED/).some(element => /no recorded|insufficient|not assessed|missing/i.test(element.textContent))).toBe(true);
  });

  it('never saves fallback rules or projected marks as recorded results', async () => {
    const saved = data();
    saved.academics.policy = { source: '', confirmed: false, attendanceThreshold: null, gradeBands: [], passRules: {} };
    const before = structuredClone(saved);
    api.mockResolvedValue({ saved: true });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<AcademicPage data={saved} onRefresh={onRefresh} />);
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('10.00');
    fireEvent.change(screen.getByLabelText('Target SGPA'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save recorded marks & target' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith('/api/academics', expect.objectContaining({ body: expect.objectContaining({ policy: before.academics.policy }) }));
    expect(api.mock.calls[0][1].body.record.marks).toEqual({ TEST101: { internal: 36 } });
    expect(api.mock.calls[0][1].body.record.confirmed).toBe(false);
    expect(saved).toEqual(before);
  });

  it('shows a locked failed component in projected and maximum SGPA instead of inventing a recovery', () => {
    const saved = data();
    saved.academics.semesters[1].marks.TEST101.internal = 15.5;
    render(<AcademicPage data={saved} onRefresh={vi.fn()} />);
    expect(screen.getByText('Projected SGPA').parentElement).toHaveTextContent('0.00');
    expect(screen.getByText('Maximum reachable SGPA').parentElement).toHaveTextContent('0.00');
    expect(screen.getByText('Recorded SGPA').parentElement).toHaveTextContent('Pending');
    expect(screen.getAllByText(/internal 15.5\/40 is below its 40% pass minimum/).length).toBeGreaterThan(0);
  });
});
