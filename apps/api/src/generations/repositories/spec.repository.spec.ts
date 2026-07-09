import { createInMemoryDb } from '../../testing/in-memory-db';
import type { DatabaseService } from '../../database/database.service';
import { SpecRepository } from './spec.repository';
import type { AgentSpec } from '@agent-builder/shared-contracts';

describe('SpecRepository (Phase 9 — spec persistence)', () => {
  const dbs: DatabaseService[] = [];
  afterAll(() => {
    for (const d of dbs) d.close();
  });

  function build() {
    const db = createInMemoryDb();
    dbs.push(db);
    return { db, repo: new SpecRepository(db) };
  }

  const agentSpec: AgentSpec = {
    agent_id: 'a',
    name: '通用智能体',
    description: 'd',
    scenario: 's',
    openjiuwen_agent_type: 'react_agent',
    system_prompt: 'p',
    model: { provider: 'openjiuwen', model_name: 'default', temperature: 0.7 },
    tools: [{ name: 'query_info', description: 'd', input_schema: {}, output_schema: {} }],
    memory: { enabled: true, type: 'short_term' },
    examples: [],
    acceptance_checks: [],
  };

  it('#1 persists and retrieves a spec by generation_id', () => {
    const { repo } = build();
    repo.save({
      generation_id: 'gen_1',
      spec: agentSpec,
      parser_mode: 'hybrid',
      provider: 'mock',
      model: null,
      prompt_hash: 'h',
      validation_status: 'valid',
    });
    const got = repo.getByGeneration('gen_1');
    expect(got).not.toBeNull();
    expect(got!.spec.name).toBe('通用智能体');
    expect(got!.parser_mode).toBe('hybrid');
    expect(got!.provider).toBe('mock');
    expect(got!.validation_status).toBe('valid');
  });

  it('#2 upserts — a second save replaces the spec (no duplicate rows)', () => {
    const { repo } = build();
    repo.save({
      generation_id: 'gen_2',
      spec: agentSpec,
      parser_mode: 'hybrid',
      provider: 'mock',
      model: null,
      prompt_hash: 'h1',
      validation_status: 'valid',
    });
    repo.save({
      generation_id: 'gen_2',
      spec: { ...agentSpec, name: 'renamed' },
      parser_mode: 'llm',
      provider: 'openai-compatible',
      model: 'qwen-plus',
      prompt_hash: 'h2',
      validation_status: 'valid',
    });
    const got = repo.getByGeneration('gen_2');
    expect(got!.spec.name).toBe('renamed');
    expect(got!.parser_mode).toBe('llm');
    expect(got!.provider).toBe('openai-compatible');
    expect(got!.model).toBe('qwen-plus');
    expect(got!.prompt_hash).toBe('h2');
  });

  it('#3 returns null for an unknown generation', () => {
    const { repo } = build();
    expect(repo.getByGeneration('gen_nope')).toBeNull();
  });
});
