import { it, expect, vi, afterEach } from 'vitest';
import { forecastCourse } from './predictions';
afterEach(()=>vi.unstubAllGlobals());
it('sends maxima and missing marks to the Python API without inventing zeros',async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({projected_percentage:50})});vi.stubGlobal('fetch',fetch);
  expect(await forecastCourse({maxima:{midterm:20,endSem:60}},{midterm:10})).toEqual({projected_percentage:50});
  expect(JSON.parse(fetch.mock.calls[0][1].body).assessments).toEqual([{maximum:20,score:10},{maximum:60,score:null}]);
});
it('surfaces API errors',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:422}));
  await expect(forecastCourse({maxima:{midterm:20}},{})).rejects.toThrow('422');
});
