#!/usr/bin/env node
/**
 * P3-007: one-command real OpenCode + real LLM end-to-end verification.
 *
 * - Hits GET /health/deep on the running API; auto-skips (exit 0) when the real
 *   OpenCode + LLM stack isn't configured, so the command is safe to run in any
 *   environment (CI, a fresh clone, a demo laptop without keys).
 * - When configured: creates a draft, confirms the parsed Spec, polls the
 *   generation to completion, then prints a report — generation id, duration,
 *   file list, smoke-test status, engine.
 *
 * Usage:
 *   1. Start the real API in another terminal:
 *        npm run dev:api:llm        # loads apps/api/.env with real keys
 *   2. Run this script:
 *        npm run test:e2e:real
 *      (override the API URL with API_BASE_URL=http://host:port)
 */
'use strict';

const API = process.env.API_BASE_URL || 'http://localhost:3001';
const PROMPT =
  '做一个员工政策问答 Agent，用户输入制度问题后调用 search_policy 工具检索政策条款并给出简明回答。';
const POLL_INTERVAL_MS = 2000;
const GEN_TIMEOUT_MS = Number(process.env.REAL_E2E_TIMEOUT_MS || 600_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status} ${url}: ${body.message ?? ''}`.trim());
  }
  return body;
}

async function poll(label, url, isDone) {
  const start = Date.now();
  for (;;) {
    const elapsed = Date.now() - start;
    if (elapsed > GEN_TIMEOUT_MS) {
      throw new Error(`timed out after ${elapsed}ms waiting for ${label}`);
    }
    const data = await getJson(url);
    if (isDone(data)) return data;
    await sleep(POLL_INTERVAL_MS);
  }
}

async function main() {
  // 1. Readiness — auto-skip when real keys / OpenCode aren't configured.
  let diag;
  try {
    diag = await getJson(`${API}/health/deep`);
  } catch (e) {
    console.log(JSON.stringify({ status: 'skipped', reason: `API unreachable at ${API}: ${e.message}` }, null, 2));
    process.exit(0);
  }
  const realReady =
    diag.opencode?.engine === 'opencode' &&
    diag.opencode?.require_real === true &&
    diag.opencode?.key_present === true &&
    diag.llm?.key_present === true;
  if (!realReady) {
    console.log(
      JSON.stringify(
        {
          status: 'skipped',
          reason: 'real OpenCode + LLM keys not configured on the API',
          diagnostics: diag,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const headers = { 'Content-Type': 'application/json' };
  const t0 = Date.now();

  // 2. Create draft + wait for the real LLM to parse the Spec.
  const draft = await getJson(`${API}/api/generations/drafts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'agent', prompt: PROMPT, mode: 'auto', model: 'default' }),
  });
  const parsed = await poll('draft parse', `${API}/api/generations/drafts/${draft.draft_id}`, (d) =>
    ['parsed', 'failed'].includes(d.status),
  );
  if (parsed.status !== 'parsed') {
    console.log(JSON.stringify({ status: 'failed', stage: 'draft_parse', draft }, null, 2));
    process.exit(1);
  }

  // 3. Confirm + wait for the generation to complete.
  const confirmed = await getJson(`${API}/api/generations/drafts/${draft.draft_id}/confirm`, {
    method: 'POST',
    headers,
  });
  const generationId = confirmed.generation_id;
  const final = await poll('generation', `${API}/api/generations/${generationId}`, (g) =>
    ['completed', 'failed'].includes(g.status),
  );
  const durationMs = Date.now() - t0;

  // 4. Gather artifacts: file tree, versions, smoke-test status.
  const tree = await getJson(`${API}/api/generations/${generationId}/files`).catch(() => []);
  const versions = await getJson(`${API}/api/generations/${generationId}/versions`).catch(() => []);
  const active =
    versions.find((v) => v.id === final.active_version_id) ?? versions[0] ?? null;
  const manifest = await getJson(`${API}/api/generations/${generationId}/manifest`).catch(() => null);

  const files = (function flatten(nodes, acc = []) {
    for (const n of nodes ?? []) {
      if (n.type === 'file') acc.push(n.path);
      if (n.children) flatten(n.children, acc);
    }
    return acc;
  })(tree);

  const report = {
    status: final.status,
    generation_id: generationId,
    engine: final.codegen_engine ?? null,
    duration_ms: durationMs,
    duration_human: `${(durationMs / 1000).toFixed(1)}s`,
    version: active?.version_label ?? null,
    smoke_test: active?.test_status ?? null,
    mock_mode: active?.mock_mode ?? null,
    file_count: files.length,
    files,
    entrypoint: manifest?.entrypoint ?? null,
    test_command: manifest?.test_command ?? null,
    error_code: final.error_code ?? null,
    error_message: final.error_message ?? null,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(final.status === 'completed' ? 0 : 1);
}

main().catch((e) => {
  console.error('[real-opencode-e2e] ERROR:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
