import { existsSync } from 'node:fs';
import { apiPort, resolvePublicOrigins } from '../shared/origins.js';
if (existsSync('.env')) process.loadEnvFile('.env');
export function readConfig(env = process.env) {
  const production=env.NODE_ENV==='production';
  const authMode=env.AUTH_MODE || (production?'provider':'demo');
  if(!['provider','demo'].includes(authMode))throw Error('AUTH_MODE must be demo or provider.');
  if(production&&authMode==='demo'&&env.ALLOW_DEMO!=='true')throw Error('Public demo login requires an explicit ALLOW_DEMO=true. Use only synthetic data.');
  const publicOrigin=resolvePublicOrigins(env,production).join(',');
  if(production&&env.COOKIE_SECURE==='false')throw Error('Production HTTPS sessions require COOKIE_SECURE=true.');
  return {production,authMode,apiKey:env.MINIMOTH_API_KEY,publicOrigin,cookieSecure:production||env.COOKIE_SECURE==='true',trustProxy:env.TRUST_PROXY==='true',sessionHours:8,host:env.HOST||'127.0.0.1',port:apiPort(env),dbPath:env.DB_PATH||'data/campus360.sqlite'};
}
