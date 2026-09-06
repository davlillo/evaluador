import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClassRubricCriterionType, ClassRubricRule } from '@/lib/scoring-modes';

interface ClassRubricPanelProps {
  rules: ClassRubricRule[];
  onChange: (rules: ClassRubricRule[]) => void;
}

const multiplicityOptions = ['0', '1', '0..1', '1..1', '*', '0..*', '1..*'];
const relationshipOptions = [
  { value: 'association', label: 'Asociación' },
  { value: 'aggregation', label: 'Agregación' },
  { value: 'composition', label: 'Composición' },
];

const criterionLabels: Record<ClassRubricCriterionType, string> = {
  classes: 'Cantidad de clases',
  relationship: 'Relación',
  multiplicity: 'Multiplicidades de una asociación',
  association_class: 'Clase de asociación',
};

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newRule(
  criterionType: Exclude<ClassRubricCriterionType, 'relationship' | 'multiplicity'>,
): ClassRubricRule {
  const id = suffix();
  if (criterionType === 'classes') {
    return {
      ruleId: `classes-${id}`,
      criterionType,
      label: 'Clases',
      weight: 20,
      expectedQuantity: 0,
    };
  }
  return {
    ruleId: `association-class-${id}`,
    criterionType,
    label: 'Clase de asociación',
    weight: 20,
    source: '',
    target: '',
    relationshipType: 'association_class',
  };
}

function newMultiplicityGroup(): ClassRubricRule[] {
  const id = suffix();
  return [
    {
      ruleId: `relationship-${id}-source`,
      criterionType: 'multiplicity',
      label: 'Multiplicidad en origen',
      weight: 5,
      source: '',
      target: '',
      relationshipType: 'association',
      multiplicityEnd: 'source',
      expectedMultiplicity: '1',
    },
    {
      ruleId: `relationship-${id}-target`,
      criterionType: 'multiplicity',
      label: 'Multiplicidad en destino',
      weight: 5,
      source: '',
      target: '',
      relationshipType: 'association',
      multiplicityEnd: 'target',
      expectedMultiplicity: '1..*',
    },
  ];
}

function MultiplicitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options = multiplicityOptions.includes(value)
    ? multiplicityOptions
    : [...multiplicityOptions, value];
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full border rounded-md px-2 py-1.5 bg-background"
    >
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function SimpleRuleCard({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: ClassRubricRule;
  onUpdate: (patch: Partial<ClassRubricRule>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-3 bg-background">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{criterionLabels[rule.criterionType]}</span>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar criterio">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="text-xs space-y-1">
          <span className="font-medium">Nombre del criterio</span>
          <input
            value={rule.label}
            onChange={(event) => onUpdate({ label: event.target.value })}
            className="w-full border rounded-md px-2 py-1.5 bg-background"
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="font-medium">Peso (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={rule.weight}
            onChange={(event) => onUpdate({
              weight: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
            })}
            className="w-full border rounded-md px-2 py-1.5 bg-background"
          />
        </label>
        {rule.criterionType === 'classes' ? (
          <label className="text-xs space-y-1">
            <span className="font-medium">Clases esperadas</span>
            <input
              type="number"
              min={0}
              value={rule.expectedQuantity ?? 0}
              onChange={(event) => onUpdate({
                expectedQuantity: Math.max(0, Number(event.target.value) || 0),
              })}
              className="w-full border rounded-md px-2 py-1.5 bg-background"
            />
          </label>
        ) : (
          <>
            <label className="text-xs space-y-1">
              <span className="font-medium">Clase origen</span>
              <input
                value={rule.source ?? ''}
                onChange={(event) => onUpdate({ source: event.target.value })}
                className="w-full border rounded-md px-2 py-1.5 bg-background"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-medium">Clase destino</span>
              <input
                value={rule.target ?? ''}
                onChange={(event) => onUpdate({ target: event.target.value })}
                className="w-full border rounded-md px-2 py-1.5 bg-background"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

export function ClassRubricPanel({ rules, onChange }: ClassRubricPanelProps) {
  const total = rules.reduce((sum, rule) => sum + rule.weight, 0);
  const classRules = rules.filter((rule) => rule.criterionType === 'classes');
  const associationClassRules = rules.filter((rule) => rule.criterionType === 'association_class');
  const relationshipRules = rules.filter((rule) => rule.criterionType === 'multiplicity');
  const groups = Array.from(
    relationshipRules.reduce((map, rule) => {
      const generatedGroup = rule.ruleId.match(
        /^((?:multiplicity|relationship)-\d+-[a-z0-9]+)-(?:existence|source|target)$/,
      )?.[1];
      const key = generatedGroup
        ?? `${rule.relationshipType ?? 'association'}\u0000${rule.source ?? ''}\u0000${rule.target ?? ''}`;
      const current = map.get(key) ?? [];
      current.push(rule);
      map.set(key, current);
      return map;
    }, new Map<string, ClassRubricRule[]>()),
  );

  const updateRule = (ruleId: string, patch: Partial<ClassRubricRule>) => {
    onChange(rules.map((rule) => rule.ruleId === ruleId ? { ...rule, ...patch } : rule));
  };

  const updateGroup = (groupRules: ClassRubricRule[], patch: Partial<ClassRubricRule>) => {
    const ids = new Set(groupRules.map((rule) => rule.ruleId));
    onChange(rules.map((rule) => ids.has(rule.ruleId) ? { ...rule, ...patch } : rule));
  };

  const setEndEnabled = (
    groupRules: ClassRubricRule[],
    end: 'source' | 'target',
    enabled: boolean,
  ) => {
    const existing = groupRules.find((rule) => rule.multiplicityEnd === end);
    if (!enabled && existing) {
      onChange(rules.filter((rule) => rule.ruleId !== existing.ruleId));
      return;
    }
    if (enabled && !existing) {
      const base = groupRules[0];
      const generatedGroup = base.ruleId.match(
        /^((?:multiplicity|relationship)-\d+-[a-z0-9]+)-(?:existence|source|target)$/,
      )?.[1];
      onChange([...rules, {
        ...base,
        ruleId: generatedGroup ? `${generatedGroup}-${end}` : `paired-${suffix()}`,
        criterionType: 'multiplicity',
        multiplicityEnd: end,
        label: `Multiplicidad en ${end === 'source' ? 'origen' : 'destino'}`,
        weight: 5,
        expectedMultiplicity: end === 'source' ? '1' : '1..*',
      }]);
    }
  };

  return (
    <div className="p-3 border rounded-lg bg-muted/10 space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Rúbrica del diagrama de clases</h4>
        <p className="text-xs text-muted-foreground">
          El peso total de cada relación es la suma de sus extremos. Para obtener
          puntos, la relación debe existir con el tipo seleccionado.
        </p>
      </div>

      <div className="space-y-3">
        {classRules.map((rule) => (
          <SimpleRuleCard
            key={rule.ruleId}
            rule={rule}
            onUpdate={(patch) => updateRule(rule.ruleId, patch)}
            onDelete={() => onChange(rules.filter((item) => item.ruleId !== rule.ruleId))}
          />
        ))}

        {groups.map(([groupKey, groupRules]) => {
          const sourceRule = groupRules.find((rule) => rule.multiplicityEnd === 'source');
          const targetRule = groupRules.find((rule) => rule.multiplicityEnd === 'target');
          const base = groupRules[0];
          const groupWeight = groupRules.reduce((sum, rule) => sum + rule.weight, 0);
          return (
            <div key={groupKey} className="border rounded-lg p-3 space-y-3 bg-background">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {relationshipOptions.find((option) => option.value === base.relationshipType)?.label
                    ?? 'Relación'} {base.source || 'origen'} – {base.target || 'destino'}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Peso total: {groupWeight}%
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const ids = new Set(groupRules.map((rule) => rule.ruleId));
                    onChange(rules.filter((rule) => !ids.has(rule.ruleId)));
                  }}
                  aria-label="Eliminar asociación"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                <label className="text-xs space-y-1">
                  <span className="font-medium">Tipo de relación</span>
                  <select
                    value={base.relationshipType ?? 'association'}
                    onChange={(event) => updateGroup(groupRules, { relationshipType: event.target.value })}
                    className="w-full border rounded-md px-2 py-1.5 bg-background"
                  >
                    {relationshipOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs space-y-1">
                  <span className="font-medium">Clase A (origen)</span>
                  <input
                    value={base.source ?? ''}
                    onChange={(event) => updateGroup(groupRules, { source: event.target.value })}
                    className="w-full border rounded-md px-2 py-1.5 bg-background"
                  />
                </label>
                <label className="text-xs space-y-1">
                  <span className="font-medium">Clase B (destino)</span>
                  <input
                    value={base.target ?? ''}
                    onChange={(event) => updateGroup(groupRules, { target: event.target.value })}
                    className="w-full border rounded-md px-2 py-1.5 bg-background"
                  />
                </label>
              </div>

              <div className="grid lg:grid-cols-2 gap-3">
                {(['source', 'target'] as const).map((end) => {
                  const rule = end === 'source' ? sourceRule : targetRule;
                  const enabled = !!rule;
                  return (
                    <div key={end} className="border rounded-md p-3 space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) => setEndEnabled(groupRules, end, event.target.checked)}
                        />
                        Evaluar multiplicidad junto a{' '}
                        {end === 'source'
                          ? base.source || 'la clase A'
                          : base.target || 'la clase B'}
                      </label>
                      {rule && (
                        <div className="grid sm:grid-cols-3 gap-2">
                          <label className="text-xs space-y-1">
                            <span>Nombre</span>
                            <input
                              value={rule.label}
                              onChange={(event) => updateRule(rule.ruleId, { label: event.target.value })}
                              className="w-full border rounded-md px-2 py-1.5 bg-background"
                            />
                          </label>
                          <label className="text-xs space-y-1">
                            <span>Multiplicidad</span>
                            <MultiplicitySelect
                              value={rule.expectedMultiplicity ?? '1'}
                              onChange={(value) => updateRule(rule.ruleId, { expectedMultiplicity: value })}
                            />
                          </label>
                          <label className="text-xs space-y-1">
                            <span>Peso (%)</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={rule.weight}
                              onChange={(event) => updateRule(rule.ruleId, {
                                weight: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                              })}
                              className="w-full border rounded-md px-2 py-1.5 bg-background"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {associationClassRules.map((rule) => (
          <SimpleRuleCard
            key={rule.ruleId}
            rule={rule}
            onUpdate={(patch) => updateRule(rule.ruleId, patch)}
            onDelete={() => onChange(rules.filter((item) => item.ruleId !== rule.ruleId))}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {!rules.some((rule) => rule.criterionType === 'classes') && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, newRule('classes')])}>
            <Plus className="w-4 h-4 mr-1" /> Clases
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, ...newMultiplicityGroup()])}>
          <Plus className="w-4 h-4 mr-1" /> Relación con multiplicidades
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, newRule('association_class')])}>
          <Plus className="w-4 h-4 mr-1" /> Clase de asociación
        </Button>
      </div>

      <p className={`text-xs font-medium ${Math.abs(total - 100) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
        Total de la rúbrica: {total}% {Math.abs(total - 100) < 0.01 ? '' : '· Debe sumar 100%'}
      </p>
      <p className="text-xs text-muted-foreground">
        Los nombres deben coincidir con el XMI. Solo se ignoran mayúsculas,
        minúsculas y tildes; no se aceptan nombres parciales ni sinónimos.
      </p>
    </div>
  );
}
