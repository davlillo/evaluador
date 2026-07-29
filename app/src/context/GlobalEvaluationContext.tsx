/* eslint-disable react-refresh/only-export-components -- hooks junto al provider */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DiagramInfo } from '@/types/comparison';
import type {
  BatchCompareResponse,
  BatchStudentResult,
  GlobalComparisonResponse,
  GlobalStudentResult,
} from '@/types/evaluation-session';

export type GlobalEvaluationMode = 'batch' | 'global' | null;

export interface ReportReturnState {
  path: string;
  studentId: string;
}

interface GlobalEvaluationContextValue {
  mode: GlobalEvaluationMode;
  batchResult: BatchCompareResponse | null;
  globalResult: GlobalComparisonResponse | null;
  expectedDiagrams: Record<string, DiagramInfo> | null;
  returnPath: string;
  reportReturn: ReportReturnState | null;
  setBatchEvaluation: (data: BatchCompareResponse) => void;
  setGlobalEvaluation: (data: GlobalComparisonResponse) => void;
  getStudentById: (studentId: string) => GlobalStudentResult | null;
  setReportReturn: (state: ReportReturnState | null) => void;
  clearGlobalEvaluation: () => void;
}

const GlobalEvaluationContext = createContext<GlobalEvaluationContextValue | null>(null);

const DIAGRAM_KINDS = ['class', 'usecase', 'sequence'] as const;

function normalizeBatchStudent(row: BatchStudentResult): GlobalStudentResult {
  const runs = {} as GlobalStudentResult['runs'];
  for (const kind of DIAGRAM_KINDS) {
    const run = row.runs[kind];
    runs[kind] = run
      ? { diagram_type: kind, ...run }
      : { diagram_type: kind, status: 'missing', similarity: null };
  }
  return {
    student_id: row.student_id,
    complete: row.complete,
    final_score: row.final_score,
    runs,
  };
}

function normalizeGlobalStudent(row: GlobalStudentResult): GlobalStudentResult {
  const runs = {} as GlobalStudentResult['runs'];
  for (const kind of DIAGRAM_KINDS) {
    const run = row.runs[kind];
    runs[kind] = run ?? { diagram_type: kind, status: 'missing', similarity: null };
  }
  return { ...row, runs };
}

export function GlobalEvaluationProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<GlobalEvaluationMode>(null);
  const [batchResult, setBatchResult] = useState<BatchCompareResponse | null>(null);
  const [globalResult, setGlobalResult] = useState<GlobalComparisonResponse | null>(null);
  const [expectedDiagrams, setExpectedDiagrams] = useState<Record<string, DiagramInfo> | null>(null);
  const [returnPath, setReturnPath] = useState('/lote');
  const [reportReturn, setReportReturn] = useState<ReportReturnState | null>(null);

  const setBatchEvaluation = useCallback((data: BatchCompareResponse) => {
    setMode('batch');
    setBatchResult(data);
    setGlobalResult(null);
    setExpectedDiagrams(data.expected_diagrams ?? null);
    setReturnPath('/lote');
  }, []);

  const setGlobalEvaluation = useCallback((data: GlobalComparisonResponse) => {
    setMode('global');
    setGlobalResult(data);
    setBatchResult(null);
    setExpectedDiagrams(data.expected_diagrams ?? null);
    setReturnPath('/lote');
  }, []);

  const getStudentById = useCallback(
    (studentId: string): GlobalStudentResult | null => {
      if (batchResult) {
        const row = batchResult.results.find((r) => r.student_id === studentId);
        return row ? normalizeBatchStudent(row) : null;
      }
      if (globalResult) {
        const row = globalResult.results.find((r) => r.student_id === studentId);
        return row ? normalizeGlobalStudent(row) : null;
      }
      return null;
    },
    [batchResult, globalResult],
  );

  const clearGlobalEvaluation = useCallback(() => {
    setMode(null);
    setBatchResult(null);
    setGlobalResult(null);
    setExpectedDiagrams(null);
    setReturnPath('/lote');
    setReportReturn(null);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      batchResult,
      globalResult,
      expectedDiagrams,
      returnPath,
      reportReturn,
      setBatchEvaluation,
      setGlobalEvaluation,
      getStudentById,
      setReportReturn,
      clearGlobalEvaluation,
    }),
    [
      mode,
      batchResult,
      globalResult,
      expectedDiagrams,
      returnPath,
      reportReturn,
      setBatchEvaluation,
      setGlobalEvaluation,
      getStudentById,
      clearGlobalEvaluation,
    ],
  );

  return (
    <GlobalEvaluationContext.Provider value={value}>
      {children}
    </GlobalEvaluationContext.Provider>
  );
}

export function useGlobalEvaluation() {
  const ctx = useContext(GlobalEvaluationContext);
  if (!ctx) {
    throw new Error('useGlobalEvaluation debe usarse dentro de GlobalEvaluationProvider');
  }
  return ctx;
}

export function buildStudentDiagramsFromRuns(
  runs: GlobalStudentResult['runs'],
): Record<string, DiagramInfo> {
  const out: Record<string, DiagramInfo> = {};
  for (const kind of DIAGRAM_KINDS) {
    const diagram = runs[kind]?.comparison?.student_diagram;
    if (diagram) {
      out[kind] = diagram;
    }
  }
  return out;
}
