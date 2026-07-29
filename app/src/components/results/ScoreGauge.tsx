import { percentToNota, isAprobado } from '@/lib/rubric';

/**
 * Anillo de calificación: muestra la nota 0-10 derivada del porcentaje de
 * similitud, con color según aprobado/reprobado. Reproduce el gauge del mockup.
 */
export function ScoreGauge({ percent, size = 150 }: { percent: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const nota = percentToNota(clamped);
  const aprobado = isAprobado(nota);

  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = aprobado ? 'hsl(var(--match))' : 'hsl(var(--mismatch))';

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold leading-none">{nota.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">/ 10</span>
        </div>
      </div>
      <span
        className={
          'text-sm font-semibold px-3 py-0.5 rounded-full ' +
          (aprobado ? 'bg-match/15 text-match' : 'bg-mismatch/15 text-mismatch')
        }
      >
        {aprobado ? 'Aprobado' : 'Reprobado'}
      </span>
    </div>
  );
}
