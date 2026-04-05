/* eslint-disable react-refresh/only-export-components -- hooks junto al provider */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { EvaluationMode } from '@/types/evaluation-session';
import type { DiagramKind } from '@/types/diagram';

interface EvaluationWizardValue {
  mode: EvaluationMode;
  diagramKind: DiagramKind | null;
  setMode: (m: EvaluationMode) => void;
  setDiagramKind: (k: DiagramKind | null) => void;
  resetWizard: () => void;
}

const EvaluationWizardContext = createContext<EvaluationWizardValue | null>(null);

export function EvaluationWizardProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<EvaluationMode>('single');
  const [diagramKind, setDiagramKindState] = useState<DiagramKind | null>(null);

  const setMode = useCallback((m: EvaluationMode) => {
    setModeState(m);
  }, []);

  const setDiagramKind = useCallback((k: DiagramKind | null) => {
    setDiagramKindState(k);
  }, []);

  const resetWizard = useCallback(() => {
    setModeState('single');
    setDiagramKindState(null);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      diagramKind,
      setMode,
      setDiagramKind,
      resetWizard,
    }),
    [mode, diagramKind, setMode, setDiagramKind, resetWizard],
  );

  return (
    <EvaluationWizardContext.Provider value={value}>
      {children}
    </EvaluationWizardContext.Provider>
  );
}

export function useEvaluationWizard() {
  const ctx = useContext(EvaluationWizardContext);
  if (!ctx) {
    throw new Error('useEvaluationWizard debe usarse dentro de EvaluationWizardProvider');
  }
  return ctx;
}
