import { redactSecrets, redactBuffer } from './redact';

describe('redact (Phase 8 — log redaction, architecture §12 #9)', () => {
  it('masks OpenAI-style keys', () => {
    expect(redactSecrets('key=sk-' + 'a'.repeat(40))).toBe('key=***REDACTED***');
  });

  it('masks AWS-style keys', () => {
    expect(redactSecrets('aws=AKIA' + 'X'.repeat(16))).toBe('aws=***REDACTED***');
  });

  it('leaves non-secret text intact', () => {
    expect(redactSecrets('python --version\nPython 3.12.3')).toBe('python --version\nPython 3.12.3');
  });

  it('redactBuffer masks text buffers but leaves binary untouched', () => {
    const text = Buffer.from('sk-' + 'b'.repeat(40));
    expect(redactBuffer(text).toString('utf8')).toBe('***REDACTED***');
    const binary = Buffer.from([0, 1, 2, 3]);
    expect(redactBuffer(binary)).toEqual(binary);
  });
});
