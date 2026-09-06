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
  actor_associations: UseCaseSliceBreakdown;
  include_relations: UseCaseSliceBreakdown;
  extend_relations: UseCaseSliceBreakdown;
  /** @deprecated Desglose anterior con todas las relaciones juntas */
  relationships?: UseCaseSliceBreakdown;
}

export interface SequenceBreakdown {
  sync_messages?: UseCaseSliceBreakdown;
  async_messages?: UseCaseSliceBreakdown;
  creation_messages?: UseCaseSliceBreakdown;
  fragment_usage?: UseCaseSliceBreakdown;
  controller_methods?: UseCaseSliceBreakdown & { future?: boolean; note?: string };
  service_methods?: UseCaseSliceBreakdown & { future?: boolean; note?: string };
  order_score?: number;
  // Legacy fields (compatibilidad)
  lifelines?: UseCaseSliceBreakdown;
  messages?: UseCaseSliceBreakdown & {
    order_score: number;
  };
}

export function isUseCaseBreakdown(
  b: Breakdown | UseCaseBreakdown | SequenceBreakdown,
): b is UseCaseBreakdown {
  return 'actors' in b && 'use_cases' in b && ('actor_associations' in b || 'relationships' in b);
}

export function isSequenceBreakdown(
  b: Breakdown | UseCaseBreakdown | SequenceBreakdown,
): b is SequenceBreakdown {
  return (
    'lifelines' in b ||
    'messages' in b ||
    'sync_messages' in b ||
    'async_messages' in b ||
    'creation_messages' in b ||
    'fragment_usage' in b
  );
}

export interface ComparisonDetail {
  element_type: string;
  name: string;
  status: 'correct' | 'missing' | 'extra' | 'partial';
  similarity_score?: number;
  semantic_match_of?: string;
  message: string;
}

export interface WeightsUsed {
  classes: number;
  attributes: number;
  methods: number;
  relationships?: number;
  include_relations?: number;
  extend_relations?: number;
  sync_messages?: number;
  async_messages?: number;
  creation_messages?: number;
  fragment_usage?: number;
}

export interface Weights {
  classes: number;
  attributes: number;
  methods: number;
  relationships: number;
  sync_messages?: number;
  async_messages?: number;
  creation_messages?: number;
  fragment_usage?: number;
  controller_methods?: number;
  service_methods?: number;
  /** Solo casos de uso: relaciones include entre CU */
  include_relations?: number;
  /** Solo casos de uso: relaciones extend entre CU */
  extend_relations?: number;
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
  /** Fragmento combinado al que pertenece: "alt", "loop [cond]", etc. Undefined si no aplica. */
  fragment?: string;
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

/** Desglose de penalización por criterio (ver score_criterion en el backend). */
export interface PenaltyDetail {
  score: number;
  base_score: number;
  penalty_applied: number;
  explanation: string;
  excess_units: number;
  deficit_units: number;
}

export interface ClassRubricResult {
  rule_id: string;
  criterion_type: 'classes' | 'relationship' | 'multiplicity' | 'association_class';
  label: string;
  source?: string | null;
  target?: string | null;
  relationship_type?: string | null;
  modeled_relationship_type?: string | null;
  multiplicity_end?: 'source' | 'target' | null;
  score: number;
  weight: number;
  contribution: number;
  expected: string | number | null;
  modeled: string | number | null;
  correct: boolean;
  message: string;
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
  /** Modo de evaluación usado. 'similarity' (o ausente) = comportamiento por defecto. */
  scoring_mode?: string;
  /** Desglose de penalización por criterio, presente cuando scoring_mode !== 'similarity'. */
  penalty_breakdown?: Record<string, PenaltyDetail>;
  class_rubric_breakdown?: ClassRubricResult[];
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
