import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UsePipes,
  Sse,
  NotFoundException,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { GenerationService } from './generation.service';
import { EventService } from './event.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createGenerationRequestSchema,
  type CreateGenerationRequest,
  type CreateGenerationResponse,
  type GenerationDto,
  toGenerationDto,
} from '@agent-builder/shared-contracts';

/**
 * REST + SSE surface for generations (PRD §11.1–11.3).
 * Phase 1: create, get, and SSE event stream. File/run/export endpoints land in Phase 6.
 */
@Controller('api/generations')
export class GenerationsController {
  constructor(
    private readonly genService: GenerationService,
    private readonly eventService: EventService,
  ) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createGenerationRequestSchema))
  async create(@Body() body: CreateGenerationRequest): Promise<CreateGenerationResponse> {
    const gen = await this.genService.createGeneration(body);
    return { generation_id: gen.id, status: gen.status };
  }

  @Get(':id')
  get(@Param('id') id: string): GenerationDto {
    const gen = this.genService.getById(id);
    if (!gen) {
      throw new NotFoundException({ error_code: 'NOT_FOUND', message: `生成任务 ${id} 不存在` });
    }
    return toGenerationDto(gen);
  }

  /**
   * SSE event stream (architecture §8.3). Replays persisted history in
   * sequence order, then streams live events. Resilient to reconnect:
   * a client may resume from `?after=<sequence>` (Phase 6 hardening).
   */
  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      // 1. Replay persisted history so a reconnecting client sees the full timeline.
      for (const evt of this.eventService.history(id)) {
        subscriber.next({ data: evt, type: evt.type });
      }
      // 2. Stream live events until the client disconnects.
      const unsubscribe = this.eventService.subscribe(id, (evt) => {
        subscriber.next({ data: evt, type: evt.type });
      });
      return () => unsubscribe();
    });
  }
}
