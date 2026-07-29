import { Check } from 'lucide-react';

const STEPS = [
  { n: 1, label: 'Subir archivos' },
  { n: 2, label: 'Procesar' },
  { n: 3, label: 'Resultados' },
] as const;

/** Indicador de progreso del flujo Subir → Procesar → Resultados. */
export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((step, i) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <div key={step.n} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <div
                className={
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ' +
                  (done
                    ? 'bg-primary text-primary-foreground'
                    : active
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/15'
                      : 'bg-muted text-muted-foreground')
                }
              >
                {done ? <Check className="w-4 h-4" /> : step.n}
              </div>
              <span
                className={
                  'text-sm font-medium hidden sm:inline ' +
                  (active ? 'text-foreground' : 'text-muted-foreground')
                }
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={'h-px w-8 sm:w-16 ' + (done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
