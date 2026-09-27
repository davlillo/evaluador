// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/* eslint-disable react-refresh/only-export-components -- hook junto al provider */
/**
 * Las correcciones a mano del docente sobre la hoja de calificación.
 *
 * El motor rellena "Modelados"; acá viven los valores que él cambió y las
 * observaciones que escribió, por estudiante y por criterio. Se guardan en
 * localStorage porque son el trabajo más caro de rehacer: recalcular el lote
 * toma segundos, revisar 46 diagramas a mano no.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readPersisted, writePersisted } from '@/lib/persisted-state';
import type { ModeledOverrides, SheetObservations } from '@/lib/grading-sheet';

const STORAGE_KEY = 'grading-sheet';

interface PersistedSheetState {
  overrides: Record<string, ModeledOverrides>;
  observations: Record<string, SheetObservations>;
}

const EMPTY_STATE: PersistedSheetState = { overrides: {}, observations: {} };

interface GradingSheetContextValue {
  getOverrides: (studentId: string) => ModeledOverrides;
  getObservations: (studentId: string) => SheetObservations;
  /** `null` devuelve la fila al valor que calculó el motor. */
  setOverride: (studentId: string, ruleId: string, value: number | null) => void;
  setObservation: (studentId: string, ruleId: string, text: string) => void;
  clearStudent: (studentId: string) => void;
  clearAll: () => void;
  /** Cuántos criterios corrigió a mano, para avisarlo en la UI. */
  overrideCount: (studentId: string) => number;
  hasAnyEdits: boolean;
}

const GradingSheetContext = createContext<GradingSheetContextValue | null>(null);

const EMPTY_OVERRIDES: ModeledOverrides = {};
const EMPTY_OBSERVATIONS: SheetObservations = {};

export function GradingSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedSheetState>(
    () => readPersisted(STORAGE_KEY, EMPTY_STATE),
  );

  useEffect(() => {
    writePersisted(STORAGE_KEY, state);
  }, [state]);

  const getOverrides = useCallback(
    (studentId: string) => state.overrides[studentId] ?? EMPTY_OVERRIDES,
    [state.overrides],
  );

  const getObservations = useCallback(
    (studentId: string) => state.observations[studentId] ?? EMPTY_OBSERVATIONS,
    [state.observations],
  );

  const setOverride = useCallback((studentId: string, ruleId: string, value: number | null) => {
    setState((prev) => {
      const forStudent = { ...(prev.overrides[studentId] ?? {}) };
      if (value === null || !Number.isFinite(value)) {
        delete forStudent[ruleId];
      } else {
        forStudent[ruleId] = value;
      }
      return { ...prev, overrides: { ...prev.overrides, [studentId]: forStudent } };
    });
  }, []);

  const setObservation = useCallback((studentId: string, ruleId: string, text: string) => {
    setState((prev) => {
      const forStudent = { ...(prev.observations[studentId] ?? {}) };
      if (text.trim() === '') {
        delete forStudent[ruleId];
      } else {
        forStudent[ruleId] = text;
      }
      return { ...prev, observations: { ...prev.observations, [studentId]: forStudent } };
    });
  }, []);

  const clearStudent = useCallback((studentId: string) => {
    setState((prev) => {
      const overrides = { ...prev.overrides };
      const observations = { ...prev.observations };
      delete overrides[studentId];
      delete observations[studentId];
      return { overrides, observations };
    });
  }, []);

  const clearAll = useCallback(() => setState(EMPTY_STATE), []);

  const overrideCount = useCallback(
    (studentId: string) => Object.keys(state.overrides[studentId] ?? {}).length,
    [state.overrides],
  );

  const hasAnyEdits = useMemo(
    () => Object.values(state.overrides).some((o) => Object.keys(o).length > 0),
    [state.overrides],
  );

  const value = useMemo<GradingSheetContextValue>(() => ({
    getOverrides,
    getObservations,
    setOverride,
    setObservation,
    clearStudent,
    clearAll,
    overrideCount,
    hasAnyEdits,
  }), [
    getOverrides, getObservations, setOverride, setObservation,
    clearStudent, clearAll, overrideCount, hasAnyEdits,
  ]);

  return (
    <GradingSheetContext.Provider value={value}>{children}</GradingSheetContext.Provider>
  );
}

export function useGradingSheet(): GradingSheetContextValue {
  const context = useContext(GradingSheetContext);
  if (!context) {
    throw new Error('useGradingSheet debe usarse dentro de <GradingSheetProvider>');
  }
  return context;
}
