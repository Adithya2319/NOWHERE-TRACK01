import test from 'node:test';
import assert from 'node:assert/strict';
import { interval, overlaps, validDate } from './domain.js';
test('date validation rejects normalization and permits leap days',()=>{
  assert.equal(validDate('2026-02-30'),false);
  assert.equal(validDate('2028-02-29'),true);
  assert.throws(()=>interval('2026-02-30T12:00:00+05:30','2026-03-02T13:00:00+05:30'));
  assert.throws(()=>interval('2026-10-16T24:00:00+05:30','2026-10-17T01:00:00+05:30'));
});
test('adjacent intervals are allowed unless a travel buffer overlaps',()=>{
  const a={start:'2026-10-16T17:00:00+05:30',end:'2026-10-16T17:30:00+05:30'};
  const b={start:'2026-10-16T17:30:00+05:30',end:'2026-10-16T18:00:00+05:30'};
  assert.equal(overlaps(a,b),false);
  assert.equal(overlaps(a,b,10),true);
});
