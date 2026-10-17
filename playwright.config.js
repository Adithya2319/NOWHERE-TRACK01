import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const installedChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir:'./e2e',workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:4174',headless:true,launchOptions:existsSync(installedChrome)?{executablePath:installedChrome}:{},trace:'retain-on-failure'},
  webServer:{command:'npm run build && node server/e2eServer.js',url:'http://127.0.0.1:4174/api/health',reuseExistingServer:false,timeout:60000},
});
