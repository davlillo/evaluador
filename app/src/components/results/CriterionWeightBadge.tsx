import { Badge } from '@/components/ui/badge';

interface CriterionWeightBadgeProps {
  weight?: number;
}

export function CriterionWeightBadge({ weight }: CriterionWeightBadgeProps) {
  if (weight === undefined) return null;

  if (weight <= 0) {
    return (
      <Badge variant="secondary" className="text-xs font-normal">
        Peso 0% · solo informativo
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs font-normal border-primary/40 text-primary">
      Aporta {weight}% a la nota
    </Badge>
  );
}
