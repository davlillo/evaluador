/* eslint-disable react-refresh/only-export-components -- hooks junto al provider */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ComparisonResult } from '@/types/comparison';

interface AutoDetectedResult {
  diagram_type: string;
  similarity: number;
  comparison: ComparisonResult;
}

interface MultiDiagramResult {
  detected_diagrams: string[];
  results: AutoDetectedResult[];
  overall_similarity: number;
  expected_diagrams: Record<string, unknown>;
  student_diagrams: Record<string, unknown>;
  xmi_source_used: string;
  evaluator_version: string;
}

type ResultType = ComparisonResult | MultiDiagramResult;

interface EvaluationResultContextValue {
  result: ResultType | null;
  /** Nombre del archivo XMI/XML subido como entrega del estudiante (se usa como carné en el PDF). */
  studentFileName: string | null;
  isMultiDiagram: boolean;
  setResult: (
    r: ResultType | null,
    meta?: { studentFileName?: string | null },
  ) => void;
  clearResult: () => void;
}

const EvaluationResultContext = createContext<EvaluationResultContextValue | null>(null);

export function EvaluationResultProvider({ children }: { children: ReactNode }) {
  const [result, setResultState] = useState<ResultType | null>(null);
  const [studentFileName, setStudentFileName] = useState<string | null>(null);

  const isMultiDiagram = useCallback((r: ResultType | null): boolean => {
    if (!r) return false;
    return 'detected_diagrams' in r && 'results' in r;
  }, []);

  const setResult = useCallback(
    (r: ResultType | null, meta?: { studentFileName?: string | null }) => {
      setResultState(r);
      if (r === null) {
        setStudentFileName(null);
      } else if (meta?.studentFileName !== undefined) {
        setStudentFileName(meta.studentFileName);
      }
    },
    [],
  );

  const clearResult = useCallback(() => {
    setResultState(null);
    setStudentFileName(null);
  }, []);

  const value = useMemo(
    () => ({
      result,
      studentFileName,
      isMultiDiagram: isMultiDiagram(result),
      setResult,
      clearResult,
    }),
    [result, studentFileName, setResult, clearResult, isMultiDiagram],
  );

  return (
    <EvaluationResultContext.Provider value={value}>
      {children}
    </EvaluationResultContext.Provider>
  );
}

export function useEvaluationResult() {
  const ctx = useContext(EvaluationResultContext);
  if (!ctx) {
    throw new Error('useEvaluationResult debe usarse dentro de EvaluationResultProvider');
  }
  return ctx;
}
