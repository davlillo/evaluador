import { Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Weights } from '@/types/comparison';
import type { DiagramKind } from '@/types/diagram';

function ClassWeightsPanel({
  weights,
  onChange,
}: {
  weights: Weights;
  onChange: (w: Weights) => void;
}) {
  const total = weights.classes + weights.attributes + weights.methods + weights.relationships;
  const isValid = Math.abs(total - 100) < 0.01;
  const fields: { key: keyof Weights; label: string; color: string }[] = [
    { key: 'classes', label: 'Clases', color: 'text-blue-600' },
    { key: 'attributes', label: 'Atributos', color: 'text-purple-600' },
    { key: 'methods', label: 'Métodos', color: 'text-teal-600' },
    { key: 'relationships', label: 'Relaciones', color: 'text-orange-600' },
  ];
  const handleChange = (key: keyof Weights, value: string) => {
    const num = Math.max(0, Math.min(100, Number(value) || 0));
    onChange({ ...weights, [key]: num });
  };
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Ponderación de criterios (diagrama de clases)
        </CardTitle>
        <CardDescription className="text-xs">
          Define cuánto vale cada criterio en la nota final. Los valores deben sumar 100%.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {fields.map(({ key, label, color }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className={'text-xs font-semibold ' + color}>{label}</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="w-full border rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
            {fields.map(({ key, color }) => (
              <div
                key={key}
                className={'h-full transition-all ' + color.replace('text-', 'bg-')}
                style={{ width: total > 0 ? (weights[key] / total) * 100 + '%' : '25%' }}
              />
            ))}
          </div>
          <span className={'text-xs font-medium ' + (isValid ? 'text-green-600' : 'text-red-500')}>
            Total: {Math.round(total)}%
          </span>
        </div>
        {!isValid && (
          <p className="text-xs text-red-500 mt-2">
            La suma debe ser exactamente 100%. Actualmente es {Math.round(total)}%.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Actores → classes, casos de uso → attributes, relaciones → relationships; methods = 0. */
function UseCaseWeightsPanel({
  weights,
  onChange,
}: {
  weights: Weights;
  onChange: (w: Weights) => void;
}) {
  const total = weights.classes + weights.attributes + weights.relationships;
  const isValid = Math.abs(total - 100) < 0.01;
  const fields: { key: 'classes' | 'attributes' | 'relationships'; label: string; color: string }[] = [
    { key: 'classes', label: 'Actores', color: 'text-blue-600' },
    { key: 'attributes', label: 'Casos de uso', color: 'text-purple-600' },
    { key: 'relationships', label: 'Relaciones', color: 'text-orange-600' },
  ];
  const handleChange = (key: 'classes' | 'attributes' | 'relationships', value: string) => {
    const num = Math.max(0, Math.min(100, Number(value) || 0));
    onChange({ ...weights, [key]: num, methods: 0 });
  };
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Ponderación (casos de uso)
        </CardTitle>
        <CardDescription className="text-xs">
          Actores, casos de uso y relaciones deben sumar 100%. Se envían al API con el mismo esquema que el
          backend (métodos en 0%).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {fields.map(({ key, label, color }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className={'text-xs font-semibold ' + color}>{label}</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="w-full border rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Métodos: 0% (no aplica en casos de uso).</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
            {fields.map(({ key, color }) => (
              <div
                key={key}
                className={'h-full transition-all ' + color.replace('text-', 'bg-')}
                style={{ width: total > 0 ? (weights[key] / total) * 100 + '%' : '33%' }}
              />
            ))}
          </div>
          <span className={'text-xs font-medium ' + (isValid ? 'text-green-600' : 'text-red-500')}>
            Total: {Math.round(total)}%
          </span>
        </div>
        {!isValid && (
          <p className="text-xs text-red-500 mt-2">
            La suma debe ser exactamente 100%. Actualmente es {Math.round(total)}%.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SequenceWeightsPlaceholder() {
  return (
    <TooltipProvider>
      <Card className="border-dashed opacity-95">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Ponderación (diagrama de secuencia)
          </CardTitle>
          <CardDescription className="text-xs">
            El comparador actual usa 40% líneas de vida y 60% mensajes. Cuando se conecten pesos
            personalizados en el backend, podrás ajustarlos aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-blue-600">Líneas de vida</span>
                  <input
                    type="number"
                    readOnly
                    disabled
                    value={40}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-muted cursor-not-allowed"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Peso fijo en el servidor por ahora</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-orange-600">Mensajes</span>
                  <input
                    type="number"
                    readOnly
                    disabled
                    value={60}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-muted cursor-not-allowed"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Peso fijo en el servidor por ahora</TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export function WeightsByDiagramType({
  diagramKind,
  weights,
  onChange,
}: {
  diagramKind: DiagramKind;
  weights: Weights;
  onChange: (w: Weights) => void;
}) {
  if (diagramKind === 'class') {
    return <ClassWeightsPanel weights={weights} onChange={onChange} />;
  }
  if (diagramKind === 'usecase') {
    return <UseCaseWeightsPanel weights={weights} onChange={onChange} />;
  }
  return <SequenceWeightsPlaceholder />;
}
