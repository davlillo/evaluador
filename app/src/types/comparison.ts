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

export interface DiagramInfo {
  name: string;
  diagram_type: string;
  classes: DiagramClass[];
  relationships: DiagramRelationship[];
  packages: string[];
}

export interface ComparisonResult {
  overall_similarity: number;
  breakdown: Breakdown;
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
