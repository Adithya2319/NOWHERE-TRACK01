import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { readConfig } from './config.js';
const config=readConfig();
const db=openDatabase(config.dbPath);
const server=createApp(db,config).listen(config.port,config.host,()=>{
  console.log(`Campus360 API: http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${config.port} (${config.authMode === 'demo' ? 'local accounts' : 'phone verification'})`);
  if(config.authMode==='provider'&&!config.apiKey)console.log('MiniMoth adapter is unconfigured. Set MINIMOTH_API_KEY on the server.');
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port is already in use. Stop the previous server or change PORT.':error.message);process.exitCode=1;db.close();});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
