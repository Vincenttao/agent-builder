import { Injectable } from '@nestjs/common';
import { EventRepository } from './repositories/event.repository';
import type { GenerationEvent } from '@agent-builder/shared-contracts';

type EventListener = (event: GenerationEvent) => void;

/**
 * Records generation events to SQLite and fans them out to live SSE
 * subscribers. New SSE connections first replay persisted history
 * (architecture §8.3 — "断线重连和日志回放") then receive live events.
 */
@Injectable()
export class EventService {
  private readonly subscribers = new Map<string, Set<EventListener>>();

  constructor(private readonly eventRepo: EventRepository) {}

  async record(input: {
    generation_id: string;
    type: string;
    message: string;
    payload?: Record<string, unknown>;
    run_id?: string | null;
  }): Promise<GenerationEvent> {
    const event = this.eventRepo.insert(input);
    this.emit(event);
    return event;
  }

  /** Persisted events in sequence order — for SSE replay and REST history. */
  history(generationId: string, afterSequence = 0): GenerationEvent[] {
    return this.eventRepo.listByGeneration(generationId, afterSequence);
  }

  /**
   * Subscribe to live events for a generation. Returns an unsubscribe fn.
   * Callers replay `history()` first, then `subscribe()` for live updates.
   */
  subscribe(generationId: string, listener: EventListener): () => void {
    let set = this.subscribers.get(generationId);
    if (!set) {
      set = new Set();
      this.subscribers.set(generationId, set);
    }
    set.add(listener);
    return () => {
      const current = this.subscribers.get(generationId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.subscribers.delete(generationId);
      }
    };
  }

  /** Test seam: number of live subscribers for a generation. */
  subscriberCount(generationId: string): number {
    return this.subscribers.get(generationId)?.size ?? 0;
  }

  private emit(event: GenerationEvent): void {
    const set = this.subscribers.get(event.generation_id);
    if (!set) return;
    for (const listener of set) {
      listener(event);
    }
  }
}
