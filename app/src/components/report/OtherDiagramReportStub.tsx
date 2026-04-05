import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportPdfButton } from '@/components/report/ExportPdfButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ComparisonResult } from '@/types/comparison';

interface OtherDiagramReportStubProps {
  result: ComparisonResult;
  onBack: () => void;
}

export function OtherDiagramReportStub({ result, onBack }: OtherDiagramReportStubProps) {
  const dt = result.diagram_type;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-2xl font-bold">Reporte</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportPdfButton />
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver a resultados
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vista de diagrama ({dt === 'usecase' ? 'casos de uso' : dt === 'sequence' ? 'secuencia' : 'no clase'})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            El reporte visual lado a lado para este tipo de diagrama se añadirá cuando el flujo esté completo.
            Puedes revisar los detalles en la pantalla de resultados y en la respuesta del API.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
