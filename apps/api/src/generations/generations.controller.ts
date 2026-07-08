import {
  Controller,
  Get,
  Param,
  Sse,
  NotFoundException,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { GenerationService } from './generation.service';
import { EventService } from './event.service';
import {
  type GenerationDto,
  toGenerationDto,
} from '@agent-builder/shared-contracts';
import { toWorkspaceRelative } from '../common/workspace';

/**
 * Generation read + SSE endpoints (PRD §11.2–11.3). Creation, files, runs and
 * exports live in the OrchestratorController (Phase 6).
 */
@Controller('api/generations')
export class GenerationsController {
  constructor(
    private readonly genService: GenerationService,
    private readonly eventService: EventService,
  ) {}

  @Get(':id')
  get(@Param('id') id: string): GenerationDto {
    const gen = this.genService.getById(id);
    if (!gen) {
      throw new NotFoundException({ error_code: 'NOT_FOUND', message: `生成任务 ${id} 不存在` });
    }
    const dto = toGenerationDto(gen);
    // Architecture §5.2: only project-relative paths returned to clients.
    dto.project_path = toWorkspaceRelative(gen.project_root);
    return dto;
  }

  /**
   * SSE event stream (architecture §8.3). Replays persisted history in
   * sequence order, then streams live events until the client disconnects.
   */
  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      for (const evt of this.eventService.history(id)) {
        subscriber.next({ data: evt, type: evt.type });
      }
      const unsubscribe = this.eventService.subscribe(id, (evt) => {
        subscriber.next({ data: evt, type: evt.type });
      });
      return () => unsubscribe();
    });
  }
}
