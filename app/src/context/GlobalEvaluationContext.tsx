// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/* eslint-disable react-refresh/only-export-components -- hooks junto al provider */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearPersisted, readPersisted, writePersisted } from '@/lib/persisted-state';
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

/** Lo que se guarda entre recargas. Ver lib/persisted-state.ts. */
const STORAGE_KEY = 'evaluation';

interface PersistedEvaluation {
  mode: GlobalEvaluationMode;
  batchResult: BatchCompareResponse | null;
  globalResult: GlobalComparisonResponse | null;
  expectedDiagrams: Record<string, DiagramInfo> | null;
}

const EMPTY_EVALUATION: PersistedEvaluation = {
  mode: null, batchResult: null, globalResult: null, expectedDiagrams: null,
};

export function GlobalEvaluationProvider({ children }: { children: ReactNode }) {
  // se restaura de localStorage: sin esto, recargar /lote o /hoja bota al
  // docente a la pantalla de carga y pierde las correcciones en curso
  const restored = useMemo(() => readPersisted(STORAGE_KEY, EMPTY_EVALUATION), []);
  const [mode, setMode] = useState<GlobalEvaluationMode>(restored.mode);
  const [batchResult, setBatchResult] = useState<BatchCompareResponse | null>(restored.batchResult);
  const [globalResult, setGlobalResult] = useState<GlobalComparisonResponse | null>(restored.globalResult);
  const [expectedDiagrams, setExpectedDiagrams] = useState<Record<string, DiagramInfo> | null>(
    restored.expectedDiagrams,
  );
  const [returnPath, setReturnPath] = useState('/lote');
  const [reportReturn, setReportReturn] = useState<ReportReturnState | null>(null);

  useEffect(() => {
    if (!batchResult && !globalResult) {
      clearPersisted(STORAGE_KEY);
      return;
    }
    writePersisted(STORAGE_KEY, { mode, batchResult, globalResult, expectedDiagrams });
  }, [mode, batchResult, globalResult, expectedDiagrams]);

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
