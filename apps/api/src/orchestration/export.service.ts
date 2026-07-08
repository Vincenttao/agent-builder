import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import type { CreateExportResponse } from '@agent-builder/shared-contracts';
import { GenerationService } from '../generations/generation.service';
import { EventService } from '../generations/event.service';
import { EventType } from '@agent-builder/shared-contracts';
import { EXPORTS_DIR } from '../common/workspace';
import { listExportableFiles } from '../files/file-service';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

/**
 * Exports a generated project as a zip (PRD FR-010, FR-010; runtime_and_sandbox §13).
 * Applies the export filter — .env, logs, caches, .venv, __pycache__ never enter
 * the archive; .env.example is kept.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly genService: GenerationService,
    private readonly eventService: EventService,
  ) {}

  async create(generationId: string): Promise<CreateExportResponse> {
    const gen = this.genService.getById(generationId);
    if (!gen) {
      throw new NotFoundException({ error_code: 'NOT_FOUND', message: `生成任务 ${generationId} 不存在` });
    }
    const version = this.genService.getActiveVersion(generationId);
    if (!version) {
      throw new BadRequestException({ error_code: 'NO_ACTIVE_VERSION', message: '无可导出的已完成版本' });
    }

    const projectPath = version.project_path;
    const exportId = `exp_${uuidv4()}`;
    const zipPath = path.join(EXPORTS_DIR, `${exportId}.zip`);
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(output);

    const slug = slugify(gen.title);
    const files = listExportableFiles(projectPath);
    for (const rel of files) {
      archive.file(path.join(projectPath, rel), { name: `${slug}/${rel}` });
    }

    const done = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      output.on('error', reject);
    });
    await archive.finalize();
    await done;

    await this.eventService.record({
      generation_id: generationId,
      type: EventType.Output,
      message: `已导出代码包（${files.length} 个文件）`,
      payload: { export_id: exportId, file_count: files.length },
    });

    return { export_id: exportId, download_url: `/api/exports/${exportId}/download` };
  }

  zipPath(exportId: string): string | null {
    const p = path.join(EXPORTS_DIR, `${exportId}.zip`);
    return fs.existsSync(p) ? p : null;
  }
}
