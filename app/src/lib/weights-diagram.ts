import type { Weights } from '@/types/comparison';
import type { DiagramKind } from '@/types/diagram';

export const SEQUENCE_FIXED_WEIGHTS: Weights = {
  classes: 40,
  attributes: 0,
  methods: 0,
  relationships: 60,
};

export function defaultWeightsForKind(kind: DiagramKind): Weights {
  switch (kind) {
    case 'class':
      return { classes: 35, attributes: 25, methods: 25, relationships: 15 };
    case 'usecase':
      return { classes: 35, attributes: 25, methods: 0, relationships: 40 };
    case 'sequence':
      return { ...SEQUENCE_FIXED_WEIGHTS };
    default:
      return { classes: 35, attributes: 25, methods: 25, relationships: 15 };
  }
}

export function weightsValidForKind(kind: DiagramKind, weights: Weights): boolean {
  if (kind === 'sequence') return true;
  if (kind === 'usecase') {
    const t = weights.classes + weights.attributes + weights.relationships;
    return Math.abs(t - 100) < 0.01 && weights.methods === 0;
  }
  const t = weights.classes + weights.attributes + weights.methods + weights.relationships;
  return Math.abs(t - 100) < 0.01;
}
