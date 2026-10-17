import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import App from './App';
import { useSharedStore } from './store/useSharedStore';
import { api } from './services/api';
import { createSemester, DEFAULT_POLICY } from './config/vesit';
vi.mock('./services/api',()=>({api:vi.fn()}));
vi.mock('react-leaflet',()=>({MapContainer:({children})=><div>{children}</div>,TileLayer:()=>null,Marker:({children})=><div>{children}</div>,Popup:({children})=><div>{children}</div>}));
beforeEach(()=>{
  useSharedStore.getState().clear();
  useSharedStore.setState({status:'loading'});
  const me={id:'test-user',name:'Route Test',classId:'fe-a',role:'student',membership:'approved',subjects:[],interests:[],onboarding:true};
  const state={me,config:{collegeName:'VESIT',timezone:'Asia/Kolkata',authMode:'demo'},classes:[{id:'fe-a',name:'FE-A EXTC'}],academics:{semesters:{1:{...createSemester(1),version:1},2:{...createSemester(2),version:1}},policy:DEFAULT_POLICY},rides:[],schedule:[],tasks:[],directory:[],leaderboard:{classes:[],students:[]},members:[]};
  api.mockImplementation(async path=>path==='/me'?{user:me}:path==='/state'?state:path==='/auth/status'?{authMode:'demo',configured:true,demoAccounts:[{id:'test-user',name:'Route Test'}]}:path.startsWith('/today')?{items:[],suggestions:[]}:{});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('connected application routes',()=>{
  const pages=[['/','Your day plan'],['/marks','Academic planner'],['/attendance','Attendance'],['/rides','Rides, with room to plan.'],['/leaderboard','Class board'],['/directory','Find your way. Find help.'],['/updates','Class schedule'],['/profile','Your profile'],['/terms','Terms'],['/privacy','Privacy'],['/cookies','Cookies'],['/login','Campus360']];
  for(const [path,title] of pages)it(`loads ${path} using the authenticated API cache`,async()=>{
    window.history.replaceState({},'',path);render(<App/>);
    expect(await screen.findByRole('heading',{name:title,exact:true})).toBeInTheDocument();
  });
});
