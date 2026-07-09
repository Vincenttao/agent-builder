/**
 * Redact secret-looking values from run logs before they are written to disk
 * or shown in the UI (architecture §12 #9, runtime_and_sandbox §12 #4).
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}/g, // JWT-like tokens
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '***REDACTED***');
  }
  return out;
}

export function redactBuffer(buf: Buffer): Buffer {
  // Only redact if the buffer looks like text; leave binary untouched.
  const isText = !buf.slice(0, 1024).includes(Buffer.from([0]));
  if (!isText) return buf;
  return Buffer.from(redactSecrets(buf.toString('utf8')), 'utf8');
}
