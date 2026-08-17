import type { ExpectedCount } from '@/lib/scoring-modes';
import { ELEMENT_TYPE_LABELS, ELEMENT_TYPES_BY_DIAGRAM } from '@/lib/scoring-modes';

export function ExpectedCountsPanel({
  diagramType,
  counts,
  onChange,
}: {
  diagramType: 'class' | 'usecase' | 'sequence';
  counts: ExpectedCount[];
  onChange: (counts: ExpectedCount[]) => void;
}) {
  const elementTypes = ELEMENT_TYPES_BY_DIAGRAM[diagramType];
  const countByType = new Map(counts.map((c) => [c.elementType, c]));

  const updateQuantity = (elementType: string, quantity: number) => {
    const others = counts.filter((c) => c.elementType !== elementType);
    onChange([...others, { elementType, expectedQuantity: quantity, label: ELEMENT_TYPE_LABELS[elementType] }]);
  };

  return (
    <div className="p-3 border rounded-lg bg-muted/10">
      <h4 className="text-sm font-semibold mb-2">Cantidades esperadas</h4>
      <div className="grid sm:grid-cols-2 gap-2">
        {elementTypes.map((elementType) => {
          const current = countByType.get(elementType);
          return (
            <div key={elementType} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
              <span className="text-xs font-medium">{ELEMENT_TYPE_LABELS[elementType]}</span>
              <input
                type="number"
                min={0}
                step={1}
                value={current?.expectedQuantity ?? 0}
                onChange={(e) => updateQuantity(elementType, Math.max(0, Number(e.target.value) || 0))}
                className="w-16 border rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
