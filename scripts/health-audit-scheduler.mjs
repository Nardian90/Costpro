#!/usr/bin/env node
/**
 * Health Audit Scheduler - runs every 1 hour
 */
import { spawn } from 'child_process';
import fs from 'fs';

const LOG = 'logs/health-audit-scheduler.log';
const SCRIPT = 'scripts/health-audit.mjs';
const INTERVAL = 60 * 60 * 1000; // 1 hour

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
}

log('Health Audit Scheduler started.');

function runAudit() {
  log('Starting health audit...');
  const child = spawn(process.execPath, [SCRIPT], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  });
  
  child.stdout.on('data', (data) => {
    process.stdout.write(data);
    try { fs.appendFileSync(LOG, data.toString()); } catch {}
  });
  
  child.stderr.on('data', (data) => {
    process.stderr.write(data);
    try { fs.appendFileSync(LOG, data.toString()); } catch {}
  });
  
  child.on('close', (code) => {
    log('Audit finished with exit code ' + code);
  });
}

runAudit();
setInterval(runAudit, INTERVAL);

process.on('SIGINT', () => { log('Scheduler stopped.'); process.exit(0); });
process.on('SIGTERM', () => { log('Scheduler stopped.'); process.exit(0); });
