import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MarksPage, AttendancePage, SemesterControl } from './Academics';
import { useCampusStore } from '../store/useCampusStore';
import { createSemester, DEFAULT_POLICY } from '../config/vesit';

beforeEach(()=>{cleanup();useCampusStore.setState({semester:1,semesters:{1:createSemester(1),2:createSemester(2)},policy:DEFAULT_POLICY});});
describe('academic workflows',()=>{
  it('edits marks, rejects overflow, switches semester and persists independent records',()=>{
    render(<><SemesterControl/><MarksPage/></>);
    const field=screen.getByLabelText('26ETBS11 Mid-term');
    fireEvent.change(field,{target:{value:'15'}});
    expect(useCampusStore.getState().semesters[1].marks['26ETBS11'].midterm).toBe(15);
    fireEvent.change(field,{target:{value:'25'}});
    expect(screen.getByRole('alert')).toHaveTextContent('within the assessment maximum');
    expect(useCampusStore.getState().semesters[1].marks['26ETBS11'].midterm).toBe(15);
    fireEvent.change(screen.getByLabelText('Semester'),{target:{value:'2'}});
    expect(screen.getByLabelText('26ETBS21 Mid-term')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('26ETBS21 Mid-term'),{target:{value:'10'}});
    fireEvent.change(screen.getByLabelText('Semester'),{target:{value:'1'}});
    expect(screen.getByLabelText('26ETBS11 Mid-term')).toHaveValue(15);
    const saved=JSON.parse(localStorage.getItem('campus360-vesit-r26-v1'));
    expect(saved.semesters[2].marks['26ETBS21'].midterm).toBe(10);
  });
  it('records and corrects dated practical attendance',()=>{
    render(<AttendancePage/>);
    fireEvent.click(screen.getAllByText('Present',{selector:'button'})[2]);
    expect(useCampusStore.getState().semesters[1].events).toHaveLength(1);
    fireEvent.click(screen.getByText('Undo record'));
    expect(useCampusStore.getState().semesters[1].events).toHaveLength(0);
  });
  it('keeps legacy records and academic data after logout',()=>{
    useCampusStore.getState().recordMark('26ETBS11','midterm',12);
    useCampusStore.getState().logout();
    expect(useCampusStore.getState().semesters[1].marks['26ETBS11'].midterm).toBe(12);
    expect(useCampusStore.getState().marks.length).toBeGreaterThan(0);
  });
});
