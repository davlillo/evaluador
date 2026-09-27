// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/**
 * La pantalla de entrada, en el orden en que trabaja el docente:
 *
 *   1. Rúbrica  — sube su Excel, se ve igual que en su hoja y la ajusta.
 *   2. Archivos — su solución y las entregas (un XMI o un ZIP del grupo).
 *   3. Resultados — la tabla del lote y la hoja editable de cada estudiante.
 *
 * Un solo estudiante va por el mismo camino que el lote (se empaqueta en un
 * ZIP de un archivo), así los resultados, la hoja y el Excel son los mismos.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle, FileCode, FileSpreadsheet,
  FolderArchive, Loader2, PencilLine, TriangleAlert, Upload,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RubricEditorTable } from '@/components/RubricTable';
import { Stepper } from '@/components/Stepper';
import { useGlobalEvaluation } from '@/context/GlobalEvaluationContext';
import { useGradingSheet } from '@/context/GradingSheetContext';
import { readPersisted, writePersisted, clearPersisted } from '@/lib/persisted-state';
import {
  checkRubricAgainstSolution,
  deriveRubricFromSolution,
  evaluationProfileJson,
  importRubricFromExcel,
  rubricIsValid,
  rubricTotal,
  type RubricCheckResult,
  type TeacherRubric,
} from '@/lib/teacher-rubric';
import type { ClassRubricRule } from '@/lib/scoring-modes';
import type { BatchCompareResponse } from '@/types/evaluation-session';
import { API_URL } from '@/lib/api';

/** La rúbrica ajustada sobrevive a un F5: rearmarla a mano es lo que más cuesta. */
const RUBRIC_KEY = 'rubric';
const RUBRIC_CONFIRMED_KEY = 'rubric:confirmed';

function fileExtension(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
}

function isUmlFile(file: File): boolean {
  return ['.xml', '.xmi', '.uml'].includes(fileExtension(file));
}

function studentIdFrom(file: File): string {
  return file.name.replace(/\.(xmi|xml|uml)$/i, '');
}

/** Un XMI suelto viaja como un lote de uno: mismo endpoint, mismos resultados. */
async function asStudentsZip(file: File): Promise<File> {
  if (fileExtension(file) === '.zip') return file;
  // JSZip solo hace falta en este caso: se baja cuando se usa
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file(file.name, file);
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'entrega.zip', { type: 'application/zip' });
}

function DropZone({
  id,
  title,
  description,
  accept,
  file,
  icon,
  onFile,
  compact = false,
}: {
  id: string;
  title: string;
  description: string;
  accept: string;
  file: File | null;
  icon: React.ReactNode;
  onFile: (file: File) => void;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  }, [onFile]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
      onDrop={onDrop}
      className={
        'relative cursor-pointer rounded-xl border-2 border-dashed text-center transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
        (compact ? 'p-6 ' : 'p-10 ') +
        (dragging
          ? 'border-primary bg-primary/5'
          : file
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/30')
      }
    >
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onFile(chosen);
          event.target.value = '';
        }}
      />
      <div className="flex flex-col items-center gap-3">
        <div
          className={
            'flex h-14 w-14 items-center justify-center rounded-full ' +
            (file ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
          }
        >
          {icon}
        </div>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        </div>
        {file && (
          <Badge variant="secondary">
            <CheckCircle className="mr-1 h-3 w-3" />
            {file.name}
          </Badge>
        )}
      </div>
    </div>
  );
}

/**
 * La solución del docente evaluada con su propia rúbrica. Si no saca 10, o la
 * rúbrica es de otro turno o un criterio no coincide con lo que dibujó: lo que
 * no cumple la solución tampoco lo va a cumplir un alumno que la hizo igual.
 */
function RubricCheckPanel({
  checking,
  check,
  error,
  onAdjust,
}: {
  checking: boolean;
  check: RubricCheckResult | null;
  error: string | null;
  onAdjust: () => void;
}) {
  if (checking) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Revisando tu solución con la rúbrica…
      </p>
    );
  }
  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }
  if (!check) return null;
  if (check.issues.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle className="h-4 w-4" />
        Tu solución saca 10 con esta rúbrica: se corresponden.
      </p>
    );
  }
  const otroTurno = check.nota < 6;
  return (
    <Alert className="border-amber-500/40 bg-amber-500/10">
      <TriangleAlert className="h-4 w-4 text-amber-600" />
      <AlertDescription className="space-y-3">
        <p className="font-medium text-foreground">
          {otroTurno
            ? `¿Es la rúbrica de esta solución? Con ella, tu propia solución saca ${check.nota.toFixed(2)}.`
            : `Tu propia solución saca ${check.nota.toFixed(2)} con esta rúbrica.`}
        </p>
        <p>
          Estos criterios no los cumple ni tu solución, así que tampoco los va a cumplir
          un estudiante que la haya hecho igual:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {check.issues.map((issue) => (
            <li key={issue.rule_id}>
              <span className="font-medium text-foreground">{issue.label}</span> — {issue.message}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={onAdjust}>
            <PencilLine className="mr-2 h-4 w-4" />
            Ajustar rúbrica
          </Button>
          <span className="text-xs">Si es a propósito, podés evaluar igual.</span>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const { setBatchEvaluation, clearGlobalEvaluation } = useGlobalEvaluation();
  const { clearAll: clearSheetEdits, hasAnyEdits } = useGradingSheet();

  const [rubric, setRubric] = useState<TeacherRubric | null>(
    () => readPersisted<TeacherRubric | null>(RUBRIC_KEY, null),
  );
  const [confirmed, setConfirmed] = useState<boolean>(
    () => readPersisted<boolean>(RUBRIC_CONFIRMED_KEY, false),
  );
  const [loadingRubric, setLoadingRubric] = useState(false);
  const [rubricError, setRubricError] = useState<string | null>(null);

  const [solutionFile, setSolutionFile] = useState<File | null>(null);
  const [deliveriesFile, setDeliveriesFile] = useState<File | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [check, setCheck] = useState<RubricCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const solutionForRubric = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rubric) writePersisted(RUBRIC_KEY, rubric);
    else clearPersisted(RUBRIC_KEY);
  }, [rubric]);

  useEffect(() => {
    writePersisted(RUBRIC_CONFIRMED_KEY, confirmed);
  }, [confirmed]);

  const step: 1 | 2 = rubric && confirmed ? 2 : 1;
  const rules = rubric?.rules;

  // Antes de calificar al grupo: ¿la rúbrica corresponde a esta solución?
  useEffect(() => {
    if (step !== 2 || !solutionFile || !rules) {
      setCheck(null);
      setCheckError(null);
      return;
    }
    let current = true;
    setChecking(true);
    setCheckError(null);
    checkRubricAgainstSolution(solutionFile, rules)
      .then((result) => { if (current) setCheck(result); })
      .catch((err) => {
        if (current) {
          setCheck(null);
          setCheckError(err instanceof Error ? err.message : 'No se pudo revisar la solución.');
        }
      })
      .finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
  }, [step, solutionFile, rules]);

  const loadRubric = async (load: () => Promise<TeacherRubric>) => {
    setLoadingRubric(true);
    setRubricError(null);
    try {
      setRubric(await load());
      setConfirmed(false);
    } catch (err) {
      setRubricError(err instanceof Error ? err.message : 'No se pudo cargar la rúbrica.');
    } finally {
      setLoadingRubric(false);
    }
  };

  const onRubricFile = (file: File) => {
    if (fileExtension(file) !== '.xlsx') {
      setRubricError('La rúbrica tiene que ser el archivo .xlsx con la tabla de calificación.');
      return;
    }
    void loadRubric(() => importRubricFromExcel(file));
  };

  const onSolutionForRubric = (file: File) => {
    if (!isUmlFile(file)) {
      setRubricError('La solución tiene que ser un .xmi exportado desde Astah.');
      return;
    }
    // la misma solución sirve después para evaluar: no hace falta subirla dos veces
    setSolutionFile(file);
    void loadRubric(() => deriveRubricFromSolution(file));
  };

  const updateRules = (rules: ClassRubricRule[]) => {
    setRubric((current) => (current ? { ...current, rules } : current));
  };

  const discardRubric = () => {
    setRubric(null);
    setConfirmed(false);
    setRubricError(null);
  };

  const evaluate = async () => {
    if (!rubric || !solutionFile || !deliveriesFile) return;
    setEvaluating(true);
    setError(null);
    try {
      const single = fileExtension(deliveriesFile) !== '.zip';
      const formData = new FormData();
      formData.append('expected_file', solutionFile);
      formData.append('students_zip', await asStudentsZip(deliveriesFile));
      // medido contra sus 46 notas: con matching semántico califica peor
      // (sube el error contra sus 46 notas de Práctica 1), así que no se usa
      formData.append('use_semantic_matching', 'false');
      formData.append('global_weight_class', '100');
      formData.append('global_weight_usecase', '0');
      formData.append('global_weight_sequence', '0');
      formData.append('evaluation_profile_json', evaluationProfileJson(rubric.rules));

      const response = await fetch(API_URL + '/api/compare-batch', { method: 'POST', body: formData });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          typeof payload?.detail === 'string' ? payload.detail : 'No se pudo evaluar las entregas.',
        );
      }
      const data: BatchCompareResponse = await response.json();

      // las correcciones a mano eran de la evaluación anterior
      clearSheetEdits();
      clearGlobalEvaluation();
      setBatchEvaluation(data);
      if (single) {
        navigate('/hoja', { state: { studentId: studentIdFrom(deliveriesFile) } });
      } else {
        navigate('/lote');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo evaluar las entregas.');
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Nueva evaluación</h2>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            {step === 1
              ? 'Empezá por la rúbrica: la misma tabla que usás en Excel para calificar.'
              : 'Ahora tu solución y las entregas de los estudiantes.'}
          </p>
        </div>
        <Stepper current={step} />
      </div>

      {step === 1 && !rubric && (
        <section className="space-y-4">
          <DropZone
            id="rubrica-excel"
            title="Subí tu rúbrica (.xlsx)"
            description="El Excel con Criterio · % · Esperados · Modelados · Nota ponderada · Observaciones. Se muestra igual que en tu hoja para que la revises."
            accept=".xlsx"
            file={null}
            icon={loadingRubric ? <Loader2 className="h-7 w-7 animate-spin" /> : <FileSpreadsheet className="h-7 w-7" />}
            onFile={onRubricFile}
          />
          <p className="text-center text-sm text-muted-foreground">
            ¿No tenés la rúbrica en Excel?{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => solutionForRubric.current?.click()}
            >
              Armarla desde tu solución (.xmi)
            </button>
            <input
              ref={solutionForRubric}
              type="file"
              accept=".xmi,.xml,.uml"
              className="hidden"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) onSolutionForRubric(chosen);
                event.target.value = '';
              }}
            />
          </p>
          {rubricError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{rubricError}</AlertDescription>
            </Alert>
          )}
        </section>
      )}

      {step === 1 && rubric && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {rubric.origin === 'excel' ? 'Rúbrica de tu Excel' : 'Rúbrica armada desde tu solución'}
              </p>
              <h3 className="text-xl font-semibold">{rubric.title}</h3>
            </div>
            <Button variant="ghost" onClick={discardRubric}>
              Usar otra rúbrica
            </Button>
          </div>

          {rubric.warnings.length > 0 && (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <ul className="space-y-1">
                  {rubric.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <RubricEditorTable rules={rubric.rules} onChange={updateRules} />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Podés cambiar los porcentajes, las clases esperadas y cada multiplicidad.
              Pasá el mouse por una fila para quitarla.
            </p>
            <Button
              size="lg"
              disabled={!rubricIsValid(rubric.rules)}
              onClick={() => setConfirmed(true)}
            >
              Usar esta rúbrica
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && rubric && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{rubric.title}</span>
              <span className="text-muted-foreground">
                · {rubric.rules.length} criterios · {Math.round(rubricTotal(rubric.rules))}%
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setConfirmed(false)}>
              <PencilLine className="mr-2 h-4 w-4" />
              Ajustar rúbrica
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <DropZone
              id="solucion"
              title="Tu solución (.xmi)"
              description="El diagrama de clases resuelto, exportado desde Astah."
              accept=".xmi,.xml,.uml"
              file={solutionFile}
              icon={<FileCode className="h-7 w-7" />}
              compact
              onFile={(file) => {
                if (!isUmlFile(file)) {
                  setError('La solución tiene que ser un .xmi exportado desde Astah.');
                  return;
                }
                setSolutionFile(file);
                setError(null);
              }}
            />
            <DropZone
              id="entregas"
              title="Entregas"
              description="Un .xmi para un estudiante, o un .zip con todo el grupo. El nombre de cada archivo es el carné (AB12345.xmi)."
              accept=".xmi,.xml,.uml,.zip"
              file={deliveriesFile}
              icon={
                deliveriesFile && fileExtension(deliveriesFile) === '.zip'
                  ? <FolderArchive className="h-7 w-7" />
                  : <Upload className="h-7 w-7" />
              }
              compact
              onFile={(file) => {
                if (!isUmlFile(file) && fileExtension(file) !== '.zip') {
                  setError('Las entregas tienen que ser un .xmi o un .zip con los .xmi adentro.');
                  return;
                }
                setDeliveriesFile(file);
                setError(null);
              }}
            />
          </div>

          <RubricCheckPanel
            checking={checking}
            check={check}
            error={checkError}
            onAdjust={() => setConfirmed(false)}
          />

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setConfirmed(false)} disabled={evaluating}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a la rúbrica
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              {hasAnyEdits && (
                <span className="text-xs text-muted-foreground">
                  Se descartan las correcciones a mano de la evaluación anterior.
                </span>
              )}
              <Button
                size="lg"
                className="min-w-[12rem]"
                disabled={evaluating || !solutionFile || !deliveriesFile}
                onClick={() => void evaluate()}
              >
                {evaluating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Evaluando…
                  </>
                ) : (
                  <>
                    {deliveriesFile && fileExtension(deliveriesFile) !== '.zip'
                      ? 'Evaluar estudiante'
                      : 'Evaluar grupo'}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
