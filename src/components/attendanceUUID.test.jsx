import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AssessmentPlanner, AttendancePage } from './Academics';
import { createSemester, DEFAULT_POLICY } from '../config/vesit';
import { useCampusStore } from '../store/useCampusStore';

beforeEach(() => {
  // Reproduce HTTP/LAN browsers: randomUUID is absent, getRandomValues is supported.
  vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
  useCampusStore.setState({
    semester: 1,
    semesters: { 1: createSemester(1), 2: createSemester(2) },
    policy: DEFAULT_POLICY,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UUID compatibility in academic actions', () => {
  it('updates the subject counts immediately for both Present and Absent', () => {
    render(<AttendancePage />);
    const subjectCard = screen.getByText('Mathematics-1 · theory').closest('.rounded-xl');
    const subject = within(subjectCard);

    fireEvent.click(subject.getByRole('button', { name: 'Present' }));
    expect(subject.getByText('1/1 attended · 100.0%')).toBeInTheDocument();
    fireEvent.click(subject.getByRole('button', { name: 'Absent' }));
    expect(subject.getByText('1/2 attended · 50.0%')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    expect(useCampusStore.getState().semesters[1].events).toHaveLength(2);
    const stored = JSON.parse(localStorage.getItem('campus360-vesit-r26-v1'));
    expect(stored.semesters[1].attendance['26ETBS11:theory']).toEqual({ present: 1, total: 2 });
  });

  it('also saves reminders without calling the missing randomUUID API', () => {
    render(<AssessmentPlanner />);
    fireEvent.change(screen.getByLabelText('Assessment title'), { target: { value: 'Mid-term revision' } });
    fireEvent.change(screen.getByLabelText('Assessment course'), { target: { value: '26ETBS11' } });
    fireEvent.change(screen.getByLabelText('Assessment due date'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add assessment' }));
    expect(useCampusStore.getState().semesters[1].deadlines).toEqual([
      expect.objectContaining({ id: expect.any(String), title: 'Mid-term revision', subject: '26ETBS11' }),
    ]);
    expect(screen.getByText(/2026-10-20 · 26ETBS11 · Mid-term revision/)).toBeInTheDocument();
  });
});
