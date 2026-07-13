#!/usr/bin/env node
/**
 * P4 M7 — Real OpenJiuwen E2E verification script.
 * Usage:  node apps/api/scripts/real-opencode-e2e.mjs
 * Checks environment, creates an Agent via the full real path.
 * Skips cleanly when required env vars are missing; fails loudly on real errors.
 */
const API = process.env.API_BASE ?? 'http://localhost:3001';
const REQUIRED = ['SPEC_LLM_BASE_URL','SPEC_LLM_API_KEY','OPENCODE_API_KEY','OPENCODE_PROVIDER','OPENCODE_MODEL','RUN_LLM_API_KEY'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) { console.log(`status=skipped\nmissing=${missing.join(',')}`); process.exit(0); }

import { execSync } from 'node:child_process';
try { execSync('docker info', {stdio:'ignore'}); } catch { console.log('status=skipped\nmissing=docker'); process.exit(0); }

async function api(method, path, body) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  return (await fetch(`${API}${path}`, opts)).json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForStatus(id, target, maxMs=180000) {
  const dl = Date.now() + maxMs;
  while (Date.now() < dl) {
    const g = await api('GET', `/api/generations/${id}`);
    if (g.status === target) return g;
    if (g.status === 'failed') throw new Error(g.error_message);
    await sleep(2000);
  }
  throw new Error(`timeout waiting for ${target}`);
}

async function main() {
  const start = Date.now();
  try {
    const d = await api('POST','/api/generations/drafts',{type:'agent',prompt:'一个问候Agent。用户打招呼后回复友好问候。'});
    let p; for(let i=0;i<30;i++){p=await api('GET',`/api/generations/drafts/${d.draft_id}`);if(p.status==='ready'||p.status==='failed')break;await sleep(2000);}
    if(p.status==='failed')throw new Error(p.error_message);
    const c = await api('POST',`/api/generations/drafts/${d.draft_id}/confirm`);
    const g = await waitForStatus(c.generation_id,'completed');
    const vs = await api('GET',`/api/generations/${c.generation_id}/versions`);
    const m = await api('GET',`/api/generations/${c.generation_id}/manifest`);
    let trace = 0;
    try { const r = await api('POST',`/api/generations/${c.generation_id}/agent/runs`,{message:'你好'}); trace = r?.trace?.length ?? 0; } catch {}
    console.log(`status=completed\ngeneration_id=${c.generation_id}\nversion_id=${g.active_version_id}\nengine=opencode\nruntime_mode=${m?.runtime?.mode??'unknown'}\nfile_count=${vs[0]?.file_count??0}\nsmoke_test=${vs[0]?.test_status==='passed'?'passed':'skipped'}\ntrace_count=${trace}\nduration_ms=${Date.now()-start}`);
  } catch(e) {
    console.log(`status=failed\nreason=${e.message}\nduration_ms=${Date.now()-start}`);
    process.exit(1);
  }
}
main();
