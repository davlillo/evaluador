import { CheckCircle2 } from 'lucide-react';
import type { ScoringMode } from '@/lib/scoring-modes';
import { SCORING_MODE_LABELS, SCORING_MODE_DESCRIPTIONS } from '@/lib/scoring-modes';

const MODES: ScoringMode[] = [
  'similarity',
  'expected_no_penalty',
  'expected_with_penalty',
  'similarity_with_penalty',
];

export function ScoringModeSelector({
  value,
  onChange,
}: {
  value: ScoringMode;
  onChange: (mode: ScoringMode) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Modo de evaluación</h4>
      <div className="grid sm:grid-cols-2 gap-2">
        {MODES.map((mode) => {
          const selected = value === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              className={
                'text-left rounded-lg border p-3 transition-colors ' +
                (selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-muted/30')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{SCORING_MODE_LABELS[mode]}</span>
                {selected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{SCORING_MODE_DESCRIPTIONS[mode]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
