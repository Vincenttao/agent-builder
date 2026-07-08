/**
 * @agent-builder/shared-contracts
 *
 * Single source of truth for types, zod schemas, and enums shared between
 * the NestJS backend (apps/api), the Next.js frontend (apps/web), and (as
 * plain JSON over the wire) the Python runner.
 *
 * P0 scope: Agent & Workflow generation only — no Skills (PRD §4.2).
 */
export * from './generation';
export * from './generation-entity';
export * from './events';
export * from './version';
export * from './runs';
export * from './sandbox';
export * from './errors';
export * from './api';
