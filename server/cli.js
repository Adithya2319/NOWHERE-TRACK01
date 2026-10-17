import { openDatabase, seedDatabase } from './db.js';
import { readConfig } from './config.js';
const config=readConfig();
const db=openDatabase(config.dbPath);
try {
  const command=process.argv[2];
  if(command==='seed'){seedDatabase(db,process.env.DEMO_DATE);console.log('Synthetic seed applied idempotently; existing rows retained.');}
  else if(command==='migrate')console.log('SQLite migrations applied without replacing existing records.');
  else if(command==='promote') {
    const id=process.argv[3];
    if(!id||process.env.CONFIRM_ADMIN!=='PROMOTE_ACCOUNT')throw Error('Operator promotion requires a user id and CONFIRM_ADMIN=PROMOTE_ACCOUNT. Review the account identity first.');
    const account=db.prepare('SELECT id FROM users WHERE id=?').get(id);
    if(!account)throw Error('Account not found. Sign in through MiniMoth and finish onboarding first.');
    db.prepare("UPDATE users SET role='moderator',membership='approved' WHERE id=?").run(id);
    console.log('The selected account is now a moderator. This is an operator action, not institutional certification.');
  }
  else if(command==='reset') {
    if(process.env.CONFIRM_RESET!=='DELETE_SYNTHETIC_DATA'||config.authMode!=='demo')throw Error('Reset is demo-only and requires CONFIRM_RESET=DELETE_SYNTHETIC_DATA. Back up the database first.');
    db.exec('BEGIN IMMEDIATE');
    try {for(const table of ['submission_history','notifications','points_ledger','submissions','tasks','ride_requests','rides','participation','schedule','sessions','user_settings','academics','users','directory','classes'])db.exec(`DELETE FROM ${table}`);db.exec("DELETE FROM meta WHERE key IN('config','demo.presentation')");db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    seedDatabase(db,process.env.DEMO_DATE);console.log('Synthetic demo reset completed.');
  }else throw Error('Use migrate, seed, promote or reset.');
}finally{db.close();}
