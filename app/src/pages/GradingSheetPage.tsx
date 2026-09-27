// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/**
 * La hoja de calificación: la misma tabla que el docente llena en su Excel.
 *
 * El motor propone la columna "Modelados" y él la corrige donde su criterio
 * difiere. La nota se recalcula al instante con su fórmula
 * (`min(E,M)/max(E,M) × peso`, total × 10).
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, Sparkles, PencilLine, TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useGlobalEvaluation } from '@/context/GlobalEvaluationContext';
import { useGradingSheet } from '@/context/GradingSheetContext';
import { buildGradingSheet, weightsAreValid, type GradingSheetRow } from '@/lib/grading-sheet';
import type { ClassRubricResult } from '@/types/comparison';
import { isAprobado } from '@/lib/rubric';
import { cn } from '@/lib/utils';
import { readPersisted, writePersisted } from '@/lib/persisted-state';

interface GradingSheetLocationState {
  studentId?: string;
}

const EMPTY_BREAKDOWN: ClassRubricResult[] = [];

/** Recordar en qué alumno iba: perder el lugar en un lote de 46 molesta. */
const LAST_STUDENT_KEY = 'grading-sheet:last-student';

function relationshipsWeight(rows: GradingSheetRow[]): number {
  return rows
    .filter((row) => row.criterionType !== 'classes')
    .reduce((sum, row) => sum + row.weight, 0);
}

export default function GradingSheetPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { batchResult, getStudentById } = useGlobalEvaluation();
  const {
    getOverrides, getObservations, setOverride, setObservation, clearStudent,
  } = useGradingSheet();

  const studentIds = useMemo(
    () => (batchResult?.results ?? []).map((row) => row.student_id),
    [batchResult],
  );
  const requested = (location.state as GradingSheetLocationState | null)?.studentId;
  const [studentId, setStudentId] = useState(() => {
    if (requested) return requested;
    // tras un F5 se pierde location.state, pero no el lugar donde iba
    const last = readPersisted<string>(LAST_STUDENT_KEY, '');
    return studentIds.includes(last) ? last : (studentIds[0] ?? '');
  });

  useEffect(() => {
    if (requested && requested !== studentId) setStudentId(requested);
    // solo cuando cambia lo que pidió la navegación
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  useEffect(() => {
    if (studentId) writePersisted(LAST_STUDENT_KEY, studentId);
  }, [studentId]);

  const student = studentId ? getStudentById(studentId) : null;
  // memoizado porque `?? []` crea un arreglo nuevo en cada render y haria
  // recalcular la hoja (y perder el foco de los inputs) sin motivo
  const breakdown = useMemo(
    () => student?.runs.class.comparison?.class_rubric_breakdown ?? EMPTY_BREAKDOWN,
    [student],
  );
  const sheet = useMemo(
    () => buildGradingSheet(breakdown, getOverrides(studentId), getObservations(studentId)),
    [breakdown, getOverrides, getObservations, studentId],
  );

  if (!batchResult) return <Navigate to="/" replace />;

  const index = studentIds.indexOf(studentId);
  const goTo = (offset: number) => {
    const next = studentIds[index + offset];
    if (next) setStudentId(next);
  };

  const aprobado = isAprobado(sheet.nota);
  const pesosOk = weightsAreValid(sheet.totalWeight);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => navigate('/lote')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver al lote
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="icon" aria-label="Estudiante anterior"
            disabled={index <= 0} onClick={() => goTo(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8rem] text-center text-sm text-muted-foreground">
            {index + 1} de {studentIds.length}
          </span>
          <Button
            variant="outline" size="icon" aria-label="Estudiante siguiente"
            disabled={index < 0 || index >= studentIds.length - 1} onClick={() => goTo(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">{studentId || 'Sin estudiante'}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Hoja de calificación — diagrama de clases
            </p>
          </div>
          <div className="text-right">
            <div className={cn(
              'text-4xl font-semibold tabular-nums',
              aprobado ? 'text-emerald-600' : 'text-destructive',
            )}>
              {sheet.nota.toFixed(2)}
            </div>
            <Badge variant={aprobado ? 'default' : 'destructive'} className="mt-1">
              {aprobado ? 'Aprobado' : 'Reprobado'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {breakdown.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Este estudiante no tiene desglose por rúbrica. Configurá la rúbrica de clases
              en la pantalla de carga y volvé a evaluar el lote.
            </p>
          ) : (
            <>
              {!pesosOk && (
                <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                  Los pesos suman {sheet.totalWeight.toFixed(2)}% en vez de 100%. La nota se
                  normaliza igual, pero conviene ajustarlos en la rúbrica.
                </p>
              )}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[13rem]">Criterio</TableHead>
                      <TableHead className="w-16 text-right">%</TableHead>
                      <TableHead className="w-20 text-right">Esperados</TableHead>
                      <TableHead className="w-28 text-right">Modelados</TableHead>
                      <TableHead className="w-28 text-right">Nota ponderada</TableHead>
                      <TableHead className="w-52">Observación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheet.groups.map((group, index) => {
                      // la sección "Relaciones" de su hoja: suma todo lo que no es "Clases"
                      const firstRelationship = index === sheet.groups.findIndex(
                        (g) => g.rows.some((row) => row.criterionType !== 'classes'),
                      );
                      return (
                        <Fragment key={group.label ?? group.rows[0].ruleId}>
                          {firstRelationship && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell className="font-semibold">Relaciones</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {Math.round(relationshipsWeight(sheet.rows))}%
                              </TableCell>
                              <TableCell colSpan={4} />
                            </TableRow>
                          )}
                          <GroupRows
                            label={group.label}
                            weight={group.weight}
                            rows={group.rows}
                            onModeledChange={(ruleId, value) => setOverride(studentId, ruleId, value)}
                            onObservationChange={(ruleId, text) => setObservation(studentId, ruleId, text)}
                          />
                        </Fragment>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {sheet.totalWeight.toFixed(0)}%
                      </TableCell>
                      <TableCell colSpan={2} />
                      <TableCell className="text-right text-lg font-semibold tabular-nums">
                        {sheet.nota.toFixed(2)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-sm text-muted-foreground">
                  {sheet.overriddenCount === 0
                    ? 'Todos los valores los calculó el sistema.'
                    : `${sheet.overriddenCount} ${sheet.overriddenCount === 1 ? 'criterio corregido' : 'criterios corregidos'} a mano.`}
                </p>
                <Button
                  variant="outline" size="sm"
                  disabled={sheet.overriddenCount === 0}
                  onClick={() => clearStudent(studentId)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar valores del sistema
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GroupRows({
  label, weight, rows, onModeledChange, onObservationChange,
}: {
  label: string | null;
  weight: number;
  rows: GradingSheetRow[];
  onModeledChange: (ruleId: string, value: number | null) => void;
  onObservationChange: (ruleId: string, text: string) => void;
}) {
  return (
    <>
      {label && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell className="whitespace-normal font-medium">{label}</TableCell>
          <TableCell className="text-right font-medium tabular-nums">
            {weight.toFixed(0)}%
          </TableCell>
          <TableCell colSpan={4} />
        </TableRow>
      )}
      {rows.map((row) => (
        <CriterionRow
          key={row.ruleId}
          row={row}
          indented={label !== null}
          onModeledChange={onModeledChange}
          onObservationChange={onObservationChange}
        />
      ))}
    </>
  );
}

function CriterionRow({
  row, indented, onModeledChange, onObservationChange,
}: {
  row: GradingSheetRow;
  indented: boolean;
  onModeledChange: (ruleId: string, value: number | null) => void;
  onObservationChange: (ruleId: string, text: string) => void;
}) {
  return (
    <TableRow>
      <TableCell
        className={cn(
          'max-w-[26rem] whitespace-normal align-top',
          indented && 'pl-8',
        )}
      >
        <span>{row.label}</span>
        {row.autoMessage && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {row.autoMessage}
          </p>
        )}
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">
        {row.weight.toFixed(row.weight % 1 === 0 ? 0 : 2)}%
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">{row.expected}</TableCell>
      <TableCell className="align-top">
        <div className="flex items-center justify-end gap-1.5">
          <Input
            type="number" min={0} step={1} value={row.modeled}
            aria-label={`Modelados — ${row.label}`}
            className={cn(
              'h-8 w-20 text-right tabular-nums',
              row.isOverridden && 'border-primary ring-1 ring-primary/30',
            )}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === '') {
                onModeledChange(row.ruleId, null);
                return;
              }
              const parsed = Number(raw);
              onModeledChange(row.ruleId, Number.isFinite(parsed) ? Math.max(0, parsed) : null);
            }}
          />
          <ModeledBadge row={row} />
        </div>
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">
        {row.weightedScore.toFixed(2)}
      </TableCell>
      <TableCell className="align-top">
        <Input
          value={row.observation}
          placeholder="—"
          aria-label={`Observación — ${row.label}`}
          className="h-8"
          onChange={(event) => onObservationChange(row.ruleId, event.target.value)}
        />
      </TableCell>
    </TableRow>
  );
}

/** Deja ver de un vistazo qué puso el sistema y qué corrigió el docente. */
function ModeledBadge({ row }: { row: GradingSheetRow }) {
  if (!row.isOverridden) {
    return (
      <span
        title="Valor calculado por el sistema"
        className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      title={`Corregido a mano. El sistema había detectado ${row.autoModeled}.`}
      className="inline-flex h-8 w-8 items-center justify-center text-primary"
    >
      <PencilLine className="h-3.5 w-3.5" />
    </span>
  );
}
