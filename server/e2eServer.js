// Isolated browser rehearsal: never opens or resets the user's database.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, seedDatabase } from './db.js';
import { createApp } from './app.js';
const directory=mkdtempSync(join(tmpdir(),'campus360-e2e-'));
const db=openDatabase(join(directory,'test.sqlite'));
const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
seedDatabase(db,date);
const server=createApp(db,{authMode:'demo',publicOrigin:'http://127.0.0.1:4174'}).listen(4174,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
