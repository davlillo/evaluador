// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

/**
 * La planilla del docente, tal cual su Excel:
 * Criterio | % | Esperados | Modelados | Nota ponderada | Observaciones.
 *
 * - `RubricEditorTable`: la rúbrica recién cargada, antes de evaluar. Se
 *   ajustan los pesos, las clases esperadas y las multiplicidades.
 * - `RubricFilledTable`: la misma tabla con la nota de un estudiante.
 */
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  buildGradingSheet,
  type GradingSheetRow,
  type ModeledOverrides,
  type SheetObservations,
} from '@/lib/grading-sheet';
import type { ClassRubricRule } from '@/lib/scoring-modes';
import {
  relationshipsTotal,
  rubricTotal,
  withExpectedMultiplicity,
} from '@/lib/teacher-rubric';
import type { ClassRubricResult } from '@/types/comparison';
import { cn } from '@/lib/utils';

const RELATIONSHIP_LABELS: Record<string, string> = {
  association: 'asociación',
  aggregation: 'agregación',
  composition: 'composición',
};

const MULTIPLICITY_LABEL = /^(Multiplicidad\s+)(\S+)(\s+en\s+.+)$/i;

function normalized(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatWeight(weight: number): string {
  const rounded = Math.round(weight * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

type EditorItem =
  | { kind: 'section'; key: string }
  | { kind: 'group'; key: string; label: string; rule: ClassRubricRule }
  | { kind: 'rule'; key: string; rule: ClassRubricRule; indented: boolean };

/** El orden de su hoja: Clases, la sección Relaciones y cada grupo con sus filas. */
function editorItems(rules: ClassRubricRule[]): EditorItem[] {
  const classes = rules.filter((rule) => rule.criterionType === 'classes');
  const relationships = rules.filter((rule) => rule.criterionType !== 'classes');
  const items: EditorItem[] = classes.map((rule) => ({
    kind: 'rule', key: rule.ruleId, rule, indented: false,
  }));
  if (relationships.length > 0) items.push({ kind: 'section', key: 'relaciones' });
  let currentGroup: string | undefined;
  for (const rule of relationships) {
    if (rule.groupLabel && rule.groupLabel !== currentGroup) {
      items.push({ kind: 'group', key: `g-${rule.ruleId}`, label: rule.groupLabel, rule });
    }
    currentGroup = rule.groupLabel;
    items.push({ kind: 'rule', key: rule.ruleId, rule, indented: !!rule.groupLabel });
  }
  return items;
}

export function RubricEditorTable({
  rules,
  onChange,
}: {
  rules: ClassRubricRule[];
  onChange: (rules: ClassRubricRule[]) => void;
}) {
  const total = rubricTotal(rules);
  const totalOk = Math.abs(total - 100) < 0.01;
  const update = (ruleId: string, patch: (rule: ClassRubricRule) => ClassRubricRule) => {
    onChange(rules.map((rule) => (rule.ruleId === ruleId ? patch(rule) : rule)));
  };
  const remove = (ruleId: string) => onChange(rules.filter((rule) => rule.ruleId !== ruleId));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[18rem]">Criterio</TableHead>
          <TableHead className="w-28 text-right">%</TableHead>
          <TableHead className="w-24 text-right">Esperados</TableHead>
          <TableHead className="w-24 text-right text-muted-foreground/70">Modelados</TableHead>
          <TableHead className="w-28 text-right text-muted-foreground/70">Nota ponderada</TableHead>
          <TableHead className="w-36 text-muted-foreground/70">Observaciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {editorItems(rules).map((item) => {
          if (item.kind === 'section') {
            return (
              <TableRow key={item.key} className="hover:bg-transparent">
                <TableCell className="font-semibold">Relaciones</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatWeight(relationshipsTotal(rules))}
                </TableCell>
                <TableCell colSpan={4} />
              </TableRow>
            );
          }
          if (item.kind === 'group') {
            return <GroupHeaderRow key={item.key} label={item.label} rule={item.rule} />;
          }
          return (
            <EditorRow
              key={item.key}
              rule={item.rule}
              indented={item.indented}
              onWeight={(weight) => update(item.rule.ruleId, (rule) => ({ ...rule, weight }))}
              onExpectedQuantity={(value) =>
                update(item.rule.ruleId, (rule) => ({ ...rule, expectedQuantity: value }))}
              onMultiplicity={(value) =>
                update(item.rule.ruleId, (rule) => withExpectedMultiplicity(rule, value))}
              onRemove={() => remove(item.rule.ruleId)}
            />
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-semibold">Total</TableCell>
          <TableCell
            className={cn(
              'text-right font-semibold tabular-nums',
              totalOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
            )}
          >
            {formatWeight(total)}
          </TableCell>
          <TableCell colSpan={4} className="whitespace-normal text-xs text-muted-foreground">
            {totalOk
              ? 'Modelados, nota ponderada y observaciones se llenan al evaluar.'
              : `Los pesos tienen que sumar 100 (${total < 100 ? 'faltan' : 'sobran'} ${formatWeight(Math.abs(100 - total))}).`}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

/**
 * Encabezado de relación. No puntúa: dice entre qué clases se busca la
 * relación y de qué tipo es. Si el nombre escrito no coincide con las clases
 * que se van a buscar (un typo que el sistema corrigió al leerla), se aclara.
 */
function GroupHeaderRow({ label, rule }: { label: string; rule: ClassRubricRule }) {
  const names = [rule.source, rule.target].filter(Boolean) as string[];
  const labelNorm = normalized(label);
  const corrected = names.some((name) => !labelNorm.includes(normalized(name)));
  const reflexive = !!rule.source && rule.source === rule.target;
  const kind = RELATIONSHIP_LABELS[rule.relationshipType ?? 'association'] ?? 'relación';
  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell className="whitespace-normal pl-6 font-medium" colSpan={6}>
        {label}
        {corrected && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            se busca {kind}{' '}
            {reflexive ? `reflexiva en ${rule.source}` : `entre ${rule.source} y ${rule.target}`}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function EditorRow({
  rule,
  indented,
  onWeight,
  onExpectedQuantity,
  onMultiplicity,
  onRemove,
}: {
  rule: ClassRubricRule;
  indented: boolean;
  onWeight: (weight: number) => void;
  onExpectedQuantity: (value: number) => void;
  onMultiplicity: (value: string) => void;
  onRemove: () => void;
}) {
  const isClasses = rule.criterionType === 'classes';
  const multiplicityMatch = rule.criterionType === 'multiplicity'
    ? rule.label.match(MULTIPLICITY_LABEL)
    : null;

  return (
    <TableRow className="group">
      <TableCell className={cn('whitespace-normal', indented ? 'pl-12' : !isClasses && 'pl-6')}>
        <div className="flex items-center gap-2">
          {multiplicityMatch ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {multiplicityMatch[1].trim()}
              <Input
                value={rule.expectedMultiplicity ?? ''}
                onChange={(event) => onMultiplicity(event.target.value)}
                aria-label={`Multiplicidad esperada — ${rule.label}`}
                className="h-7 w-16 px-1.5 text-center font-mono text-sm"
              />
              {multiplicityMatch[3].trim()}
            </span>
          ) : (
            <span className={cn(!indented && 'font-medium')}>{rule.label}</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`Quitar ${rule.label}`}
            title="Quitar este criterio"
            className="ml-auto h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={Number.isFinite(rule.weight) ? rule.weight : 0}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onWeight(Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0);
          }}
          aria-label={`Peso de ${rule.label}`}
          className="ml-auto h-8 w-20 text-right tabular-nums"
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {isClasses ? (
          <Input
            type="number"
            min={0}
            step={1}
            value={rule.expectedQuantity ?? 0}
            onChange={(event) => {
              const parsed = Math.round(Number(event.target.value));
              onExpectedQuantity(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
            }}
            aria-label="Clases esperadas"
            className="ml-auto h-8 w-16 text-right tabular-nums"
          />
        ) : (
          '1'
        )}
      </TableCell>
      <TableCell className="text-right text-muted-foreground/50">—</TableCell>
      <TableCell className="text-right text-muted-foreground/50">—</TableCell>
      <TableCell className="text-muted-foreground/50">—</TableCell>
    </TableRow>
  );
}

export function RubricFilledTable({
  breakdown,
  overrides = {},
  observations = {},
  onOverrideChange,
  onObservationChange,
  showTotal = true,
}: {
  breakdown: ClassRubricResult[];
  overrides?: ModeledOverrides;
  observations?: SheetObservations;
  onOverrideChange?: (ruleId: string, value: number | null) => void;
  onObservationChange?: (ruleId: string, text: string) => void;
  showTotal?: boolean;
}) {
  const editable = !!onOverrideChange;
  const sheet = buildGradingSheet(breakdown, overrides, observations);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[16rem]">Criterio</TableHead>
          <TableHead className="w-20 text-right">%</TableHead>
          <TableHead className="w-24 text-right">Esperados</TableHead>
          <TableHead className="w-20 text-right">Modelados</TableHead>
          <TableHead className="w-24 text-right">Nota</TableHead>
          <TableHead className="w-44">Observación</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sheet.groups.map((group, i) => (
          <FilledGroupRows
            key={i}
            label={group.label}
            weight={group.weight}
            rows={group.rows}
            editable={editable}
            onModeledChange={onOverrideChange}
            onObservationChange={onObservationChange}
          />
        ))}
      </TableBody>
      {showTotal && (
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {sheet.totalWeight.toFixed(1)}%
            </TableCell>
            <TableCell colSpan={2} />
            <TableCell className="text-right text-lg font-semibold tabular-nums">
              {sheet.nota.toFixed(2)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

function FilledGroupRows({
  label,
  weight,
  rows,
  editable,
  onModeledChange,
  onObservationChange,
}: {
  label: string | null;
  weight: number;
  rows: GradingSheetRow[];
  editable: boolean;
  onModeledChange?: (ruleId: string, value: number | null) => void;
  onObservationChange?: (ruleId: string, text: string) => void;
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
        <FilledRow
          key={row.ruleId}
          row={row}
          indented={label !== null}
          editable={editable}
          onModeledChange={onModeledChange}
          onObservationChange={onObservationChange}
        />
      ))}
    </>
  );
}

function FilledRow({
  row,
  indented,
  editable,
  onModeledChange,
  onObservationChange,
}: {
  row: GradingSheetRow;
  indented: boolean;
  editable: boolean;
  onModeledChange?: (ruleId: string, value: number | null) => void;
  onObservationChange?: (ruleId: string, text: string) => void;
}) {
  const [modeledDraft, setModeledDraft] = useState(String(row.modeled));
  if (Number(modeledDraft) !== row.modeled && !editable) {
    setModeledDraft(String(row.modeled));
  }
  return (
    <TableRow>
      <TableCell className={cn('max-w-[26rem] whitespace-normal align-top', indented && 'pl-8')}>
        <span>{row.label}</span>
        {row.autoMessage && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{row.autoMessage}</p>
        )}
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">
        {row.weight.toFixed(row.weight % 1 === 0 ? 0 : 2)}%
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">{String(row.expected)}</TableCell>
      <TableCell className="text-right align-top">
        {editable && onModeledChange ? (
          <Input
            type="number"
            min={0}
            step={1}
            value={modeledDraft}
            onChange={(e) => {
              const raw = e.target.value;
              setModeledDraft(raw);
              if (raw === '') {
                onModeledChange(row.ruleId, null);
                return;
              }
              const parsed = Number(raw);
              if (Number.isFinite(parsed)) {
                onModeledChange(row.ruleId, Math.max(0, parsed));
              }
            }}
            aria-label={`Modelados — ${row.label}`}
            className={cn(
              'h-8 w-20 text-right tabular-nums',
              row.isOverridden && 'border-primary ring-1 ring-primary/30',
            )}
          />
        ) : (
          <span className={cn('tabular-nums', row.isOverridden && 'text-primary')}>
            {String(row.modeled)}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">
        {row.weightedScore.toFixed(2)}
      </TableCell>
      <TableCell className="align-top">
        {editable && onObservationChange ? (
          <Input
            value={row.observation}
            placeholder="—"
            aria-label={`Observación — ${row.label}`}
            className="h-8"
            onChange={(e) => onObservationChange(row.ruleId, e.target.value)}
          />
        ) : (
          <span className="text-sm text-muted-foreground">{row.observation || '—'}</span>
        )}
      </TableCell>
    </TableRow>
  );
}
