/**
 * Tipos para el resultado de comparación de diagramas UML
 */

export interface AttributeComparison {
  correct: number;
  total: number;
  missing: string[];
  extra: string[];
}

export interface MethodComparison {
  correct: number;
  total: number;
  missing: string[];
  extra: string[];
}

export interface ClassResult {
  class_name: string;
  similarity: number;
  attributes: AttributeComparison;
  methods: MethodComparison;
}

export interface ClassesBreakdown {
  similarity: number;
  expected: number;
  found: number;
  correct: number;
  missing: string[];
  extra: string[];
}

export interface AttributesBreakdown {
  similarity: number;
  expected: number;
  found: number;
  correct: number;
}

export interface MethodsBreakdown {
  similarity: number;
  expected: number;
  found: number;
  correct: number;
}

export interface RelationshipsBreakdown {
  similarity: number;
  expected: number;
  found: number;
  correct: number;
  missing: string[];
  extra: string[];
}

export interface Breakdown {
  classes: ClassesBreakdown;
  attributes: AttributesBreakdown;
  methods: MethodsBreakdown;
  relationships: RelationshipsBreakdown;
}

/** Desglose cuando diagram_type === 'usecase' (API). */
export interface UseCaseSliceBreakdown {
  similarity: number;
  expected: number;
  found: number;
  correct: number;
  missing?: string[];
  extra?: string[];
}

export interface UseCaseBreakdown {
  actors: UseCaseSliceBreakdown;
  use_cases: UseCaseSliceBreakdown;
  relationships: UseCaseSliceBreakdown;
}

export interface SequenceBreakdown {
  lifelines: UseCaseSliceBreakdown;
  messages: UseCaseSliceBreakdown & {
    order_score: number;
  };
}

export function isUseCaseBreakdown(
  b: Breakdown | UseCaseBreakdown | SequenceBreakdown,
): b is UseCaseBreakdown {
  return 'actors' in b && 'use_cases' in b;
}

export function isSequenceBreakdown(
  b: Breakdown | UseCaseBreakdown | SequenceBreakdown,
): b is SequenceBreakdown {
  return 'lifelines' in b && 'messages' in b;
}

export interface ComparisonDetail {
  element_type: string;
  name: string;
  status: 'correct' | 'missing' | 'extra' | 'partial';
  similarity_score?: number;
  message: string;
}

export interface WeightsUsed {
  classes: number;
  attributes: number;
  methods: number;
  relationships: number;
}

export interface DiagramAttribute {
  name: string;
  type: string;
  visibility: string;
  default_value: string | null;
  is_static: boolean;
  is_final: boolean;
}

export interface DiagramMethod {
  name: string;
  return_type: string;
  visibility: string;
  parameters: { name: string; type: string }[];
  is_static: boolean;
  is_abstract: boolean;
}

export interface DiagramClass {
  name: string;
  attributes: DiagramAttribute[];
  methods: DiagramMethod[];
  is_abstract: boolean;
  is_interface: boolean;
  stereotype: string | null;
  package: string | null;
}

export interface DiagramRelationship {
  source: string;
  target: string;
  relationship_type: string;
  name: string | null;
  source_multiplicity?: string;
  target_multiplicity?: string;
}

/** Elemento en diagramas de casos de uso (respuesta del API). */
export interface DiagramActor {
  name: string;
}

export interface DiagramUseCaseItem {
  name: string;
}

export interface DiagramLifeline {
  name: string;
  represents: string;
}

export interface DiagramMessage {
  name: string;
  source_lifeline: string;
  target_lifeline: string;
  message_sort: string;
  sequence_order: number;
}

export interface DiagramInfo {
  name: string;
  diagram_type: string;
  classes: DiagramClass[];
  relationships: DiagramRelationship[];
  packages: string[];
  /** Presente en diagramas de tipo usecase cuando el parser los incluye. */
  actors?: DiagramActor[];
  use_cases?: DiagramUseCaseItem[];
  /** Presente en diagramas de tipo sequence cuando el parser los incluye. */
  lifelines?: DiagramLifeline[];
  messages?: DiagramMessage[];
}

export interface ComparisonResult {
  overall_similarity: number;
  /** Tipo detectado en el diagrama esperado: class | usecase | sequence */
  diagram_type?: string;
  breakdown: Breakdown | UseCaseBreakdown | SequenceBreakdown;
  class_details: ClassResult[];
  details: ComparisonDetail[];
  weights_used?: WeightsUsed;
  expected_diagram?: DiagramInfo;
  student_diagram?: DiagramInfo;
}

export interface ParsedDiagram {
  success: boolean;
  diagram: {
    name: string;
    diagram_type: string;
    classes: {
      name: string;
      attributes: {
        name: string;
        type: string;
        visibility: string;
      }[];
      methods: {
        name: string;
        return_type: string;
        visibility: string;
      }[];
      is_abstract: boolean;
      is_interface: boolean;
    }[];
    relationships: {
      source: string;
      target: string;
      relationship_type: string;
    }[];
  };
}

export interface Weights {
  classes: number;
  attributes: number;
  methods: number;
  relationships: number;
}
