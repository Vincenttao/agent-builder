import { GenerationType } from './generation';

/** Full Generation entity (architecture §7.1 / PRD §7.1). */
export interface Generation {
  id: string;
  type: GenerationType;
  title: string;
  user_prompt: string;
  status: string; // GenerationStatus
  selected_model: string;
  mode: string;
  active_version_id: string | null;
  project_root: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

/** Public DTO for GET /api/generations/{id} (PRD §11.2). */
export interface GenerationDto {
  generation_id: string;
  type: GenerationType;
  title: string;
  status: string;
  selected_model: string;
  active_version_id: string | null;
  project_path: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export function toGenerationDto(g: Generation): GenerationDto {
  return {
    generation_id: g.id,
    type: g.type,
    title: g.title,
    status: g.status,
    selected_model: g.selected_model,
    active_version_id: g.active_version_id,
    project_path: g.project_root,
    error_code: g.error_code,
    error_message: g.error_message,
    created_at: g.created_at,
    updated_at: g.updated_at,
  };
}
