import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * Minimal EventSource mock for jsdom (the SSE hook uses it). Tests can drive
 * events via `MockEventSource.last`.
 */
class MockEventSource {
  static last: MockEventSource | null = null;
  url: string;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private listeners = new Map<string, Set<(e: MessageEvent) => void>>();
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.get(type)?.delete(fn);
  }
  close() {
    this.readyState = 2;
  }
  /** Test seam: emit a named event with JSON data. */
  emit(type: string, data: unknown) {
    const evt = { data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent;
    this.onmessage?.(evt);
    this.listeners.get(type)?.forEach((fn) => fn(evt));
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
}

globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

// Silence the CJS-deprecation noise from Vite during tests.
vi.stubEnv('NODE_ENV', 'test');
