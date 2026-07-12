'use client';

import { useEffect, useRef, useState } from 'react';
import type { GenerationEvent, GenerationStatus } from '@agent-builder/shared-contracts';
import { getGeneration, getGenerationEvents } from './api';

function mergeEvents(prev: GenerationEvent[], incoming: GenerationEvent[]): GenerationEvent[] {
  if (incoming.length === 0) return prev;
  const byId = new Map(prev.map((event) => [event.id, event]));
  for (const event of incoming) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}

function isTerminalStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'failed';
}

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
  const latestSequenceRef = useRef(0);

  useEffect(() => {
    if (!generationId) return;
    const genId = generationId;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    latestSequenceRef.current = 0;
    setEvents([]);
    setStatus(null);

    // Seed status from REST, then open the SSE stream.
    getGeneration(genId)
      .then((g) => {
        if (!cancelled) setStatus(g.status as GenerationStatus);
      })
      .catch(() => undefined);

    async function syncFromRest() {
      if (cancelled) return;
      try {
        const [history, generation] = await Promise.all([
          getGenerationEvents(genId, latestSequenceRef.current),
          getGeneration(genId),
        ]);
        if (cancelled) return;
        setEvents((prev) => {
          const merged = mergeEvents(prev, history);
          latestSequenceRef.current = merged.reduce((max, event) => Math.max(max, event.sequence), 0);
          return merged;
        });
        setStatus(generation.status as GenerationStatus);
        if (isTerminalStatus(generation.status)) {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          sourceRef.current?.close();
          setConnected(true);
          setReconnecting(false);
        }
      } catch {
        // SSE remains the primary live channel; REST sync is a best-effort catch-up.
      }
    }

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
          const merged = mergeEvents(prev, [evt]);
          latestSequenceRef.current = Math.max(latestSequenceRef.current, evt.sequence);
          return merged;
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
    void syncFromRest();
    pollTimer = setInterval(() => {
      void syncFromRest();
    }, 2_000);
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      sourceRef.current?.close();
    };
  }, [generationId]);

  return { events, status, connected, reconnecting };
}
