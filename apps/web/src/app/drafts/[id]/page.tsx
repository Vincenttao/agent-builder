'use client';

import { useParams } from 'next/navigation';
import { SpecConfirmation } from '@/components/spec/SpecConfirmation';

export default function DraftPage() {
  const params = useParams();
  return <SpecConfirmation draftId={String(params.id)} />;
}
