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

interface EvaluationResultContextValue {
  result: ComparisonResult | null;
  /** Nombre del archivo XMI/XML subido como entrega del estudiante (se usa como carné en el PDF). */
  studentFileName: string | null;
  setResult: (
    r: ComparisonResult | null,
    meta?: { studentFileName?: string | null },
  ) => void;
  clearResult: () => void;
}

const EvaluationResultContext = createContext<EvaluationResultContextValue | null>(null);

export function EvaluationResultProvider({ children }: { children: ReactNode }) {
  const [result, setResultState] = useState<ComparisonResult | null>(null);
  const [studentFileName, setStudentFileName] = useState<string | null>(null);

  const setResult = useCallback(
    (r: ComparisonResult | null, meta?: { studentFileName?: string | null }) => {
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
    () => ({ result, studentFileName, setResult, clearResult }),
    [result, studentFileName, setResult, clearResult],
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
