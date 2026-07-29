import { useState } from 'react';
import { Pencil, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { percentToNota } from '@/lib/rubric';

/**
 * Nota final editable por el docente. Parte de la nota sugerida por el motor
 * (derivada del % de similitud) y permite sobrescribirla antes de exportar.
 */
export function EditableNota({
  percent,
  onChange,
}: {
  percent: number;
  onChange?: (nota: number) => void;
}) {
  const suggested = percentToNota(percent);
  const [nota, setNota] = useState<number>(suggested);
  const [editing, setEditing] = useState(false);
  const overridden = Math.abs(nota - suggested) > 0.001;

  const commit = (value: number) => {
    const clamped = Math.max(0, Math.min(10, value));
    setNota(clamped);
    onChange?.(clamped);
  };

  return (
    <div className="flex items-center gap-3">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Nota final</p>
        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={nota}
              onChange={(e) => commit(Number(e.target.value) || 0)}
              className="w-20 border rounded-md px-2 py-1 text-lg font-bold bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            <span className="text-muted-foreground">/ 10</span>
            <Button size="icon" variant="ghost" onClick={() => setEditing(false)}>
              <Check className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-3xl font-bold leading-none">{nota.toFixed(1)}</span>
            <span className="text-muted-foreground">/ 10</span>
            <Button size="icon" variant="ghost" onClick={() => setEditing(true)} title="Ajustar nota">
              <Pencil className="w-4 h-4" />
            </Button>
            {overridden && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => commit(suggested)}
                title="Restaurar nota sugerida"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
        {overridden && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Sugerida por el motor: {suggested.toFixed(1)}
          </p>
        )}
      </div>
    </div>
  );
}
