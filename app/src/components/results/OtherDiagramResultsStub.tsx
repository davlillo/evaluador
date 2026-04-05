import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ComparisonResult } from '@/types/comparison';

interface OtherDiagramResultsStubProps {
  result: ComparisonResult;
  onBack: () => void;
  onViewReport: () => void;
}

function labelForWeightKey(key: string, diagramType: string | undefined): string {
  if (diagramType === 'usecase') {
    if (key === 'classes') return 'Actores';
    if (key === 'attributes') return 'Casos de uso';
    if (key === 'relationships') return 'Relaciones';
    if (key === 'methods') return 'Métodos';
  }
  if (diagramType === 'sequence') {
    if (key === 'classes') return 'Líneas de vida';
    if (key === 'relationships') return 'Mensajes';
  }
  if (key === 'classes') return 'Clases';
  if (key === 'attributes') return 'Atributos';
  if (key === 'methods') return 'Métodos';
  return 'Relaciones';
}

export function OtherDiagramResultsStub({
  result,
  onBack,
  onViewReport,
}: OtherDiagramResultsStubProps) {
  const dt = result.diagram_type;
  const weights = result.weights_used;

  return (
    <div className="space-y-6">
      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle className="text-xl">
            Resultado ({dt === 'usecase' ? 'casos de uso' : dt === 'sequence' ? 'secuencia' : dt ?? 'otro'})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Vista resumida: la interfaz detallada para este tipo de diagrama se completará en paralelo con el
            motor de comparación. La similitud global y los datos del API ya están disponibles abajo.
          </p>
          <div className="text-4xl font-bold text-primary">{Math.round(result.overall_similarity)}%</div>
          <p className="text-sm text-muted-foreground">Similitud global</p>
          {weights && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(weights).map(([key, val]) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {labelForWeightKey(key, dt)}: {val}%
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-center gap-4">
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Nueva comparación
        </Button>
        <Button onClick={onViewReport} variant="secondary">
          <FileText className="w-4 h-4 mr-2" /> Ver reporte
        </Button>
      </div>
    </div>
  );
}
