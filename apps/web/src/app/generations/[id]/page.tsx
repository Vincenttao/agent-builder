'use client';

import { useParams } from 'next/navigation';
import { GenerationWorkspace } from '@/components/workspace/GenerationWorkspace';

/** Generation workspace route (PRD §6.2 / §12.2). */
export default function GenerationPage() {
  const params = useParams();
  const id = String(params.id);
  return <GenerationWorkspace id={id} />;
}
