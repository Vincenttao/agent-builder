'use client';

import { useEffect, useRef, useState } from 'react';
import type { GenerationEvent, GenerationStatus } from '@agent-builder/shared-contracts';
import { getGeneration } from './api';

/**
 * SSE hook: subscribes to /api/generations/{id}/events, accumulates events in
 * sequence order, and tracks the generation status. Reconnects on drop with a
 * reconnect indicator (PRD §12.2, architecture §8.3).
 */
export function useGenerationEvents(generationId: string | null) {
  const [events, setEvents] = useState<GenerationEvent[]>([]);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!generationId) return;
    const genId = generationId;
    let cancelled = false;

    // Seed status from REST, then open the SSE stream.
    getGeneration(genId)
      .then((g) => {
        if (!cancelled) setStatus(g.status as GenerationStatus);
      })
      .catch(() => undefined);

    const open = () => {
      const source = new EventSource(`/api/generations/${genId}/events`);
      sourceRef.current = source;
      source.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setReconnecting(false);
      };
      source.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        setReconnecting(true);
        // Let the browser's built-in EventSource reconnect handle it.
        // Do NOT call source.close() + setTimeout(open) — that creates a
        // double connection (D-003).
      };
      source.onmessage = (e) => handleMessage(e.data);
      // Named events (event: <type>) arrive on addEventListener.
      const handler = (e: MessageEvent) => handleMessage(e.data);
      source.addEventListener('plan_created', handler);
      source.addEventListener('file_created', handler);
      source.addEventListener('file_updated', handler);
      source.addEventListener('test_started', handler);
      source.addEventListener('test_finished', handler);
      source.addEventListener('run_started', handler);
      source.addEventListener('run_finished', handler);
      source.addEventListener('sandbox_started', handler);
      source.addEventListener('sandbox_finished', handler);
      source.addEventListener('opencode_started', handler);
      source.addEventListener('opencode_file_changed', handler);
      source.addEventListener('opencode_finished', handler);
      source.addEventListener('thought', handler);
      source.addEventListener('command_started', handler);
      source.addEventListener('command_finished', handler);
      source.addEventListener('node_started', handler);
      source.addEventListener('node_finished', handler);
      source.addEventListener('output', handler);
      source.addEventListener('error', handler);
    };

    function handleMessage(raw: unknown) {
      if (typeof raw !== 'string') return;
      try {
        const evt = JSON.parse(raw) as GenerationEvent;
        setEvents((prev) => {
          if (prev.some((e) => e.id === evt.id)) return prev;
          return [...prev, evt].sort((a, b) => a.sequence - b.sequence);
        });
        // Derive status from terminal events (D-017: also handle error events).
        if (
          evt.type === 'output' ||
          evt.type === 'test_finished' ||
          evt.type === 'error'
        ) {
          // best-effort: refresh status from REST
          getGeneration(genId)
            .then((g) => !cancelled && setStatus(g.status as GenerationStatus))
            .catch(() => undefined);
        }
      } catch {
        // ignore non-JSON keepalives
      }
    }

    open();
    return () => {
      cancelled = true;
      sourceRef.current?.close();
    };
  }, [generationId]);

  return { events, status, connected, reconnecting };
}
