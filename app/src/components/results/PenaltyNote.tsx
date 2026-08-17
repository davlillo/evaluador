import { TrendingDown } from 'lucide-react';
import type { PenaltyDetail } from '@/types/comparison';

/** Nota de penalización por criterio, mostrada cuando scoring_mode !== 'similarity'. */
export function PenaltyNote({ detail }: { detail?: PenaltyDetail }) {
  if (!detail || detail.penalty_applied <= 0) return null;
  return (
    <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5">
      <TrendingDown className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{detail.explanation}</span>
    </div>
  );
}
