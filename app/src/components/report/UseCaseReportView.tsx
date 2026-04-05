import { ArrowLeft, User, CircleDot, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportPdfButton } from '@/components/report/ExportPdfButton';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { DiagramInfo } from '@/types/comparison';

const relLabel: Record<string, string> = {
  inheritance: 'Herencia',
  association: 'Asociación',
  aggregation: 'Agregación',
  composition: 'Composición',
  dependency: 'Dependencia',
  implementation: 'Realización',
  include: 'Include',
  extend: 'Extend',
};

interface UseCaseReportViewProps {
  result: {
    expected_diagram?: DiagramInfo;
    student_diagram?: DiagramInfo;
  };
  onBack: () => void;
}

function UseCaseDiagramPanel({ diagram, title }: { diagram: DiagramInfo; title: string }) {
  const actors = diagram.actors ?? [];
  const useCases = diagram.use_cases ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-normal">
            {diagram.name || 'Sin nombre'}
          </Badge>
          <Badge variant="secondary">{actors.length} actores</Badge>
          <Badge variant="secondary">{useCases.length} casos de uso</Badge>
          <Badge variant="secondary">{diagram.relationships.length} relaciones</Badge>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
          <User className="w-3.5 h-3.5" /> Actores
        </p>
        {actors.length === 0 ? (
          <Alert>
            <AlertDescription className="text-xs">No se detectaron actores.</AlertDescription>
          </Alert>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {actors.map((a, i) => (
              <li key={i}>
                <Badge variant="secondary" className="font-mono text-xs font-normal">
                  {a.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
          <CircleDot className="w-3.5 h-3.5" /> Casos de uso
        </p>
        {useCases.length === 0 ? (
          <Alert>
            <AlertDescription className="text-xs">No se detectaron casos de uso.</AlertDescription>
          </Alert>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {useCases.map((uc, i) => (
              <li key={i}>
                <Badge className="font-mono text-xs font-normal bg-primary/15 text-foreground hover:bg-primary/20">
                  {uc.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {diagram.relationships.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5" /> Relaciones
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left px-3 py-2 font-medium border-b">Origen</th>
                  <th className="text-left px-3 py-2 font-medium border-b">Destino</th>
                  <th className="text-left px-3 py-2 font-medium border-b">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium border-b">Nombre</th>
                </tr>
              </thead>
              <tbody>
                {diagram.relationships.map((rel, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="px-3 py-1.5 border-b font-mono">{rel.source}</td>
                    <td className="px-3 py-1.5 border-b font-mono">{rel.target}</td>
                    <td className="px-3 py-1.5 border-b">
                      <Badge variant="outline" className="text-[10px]">
                        {relLabel[rel.relationship_type] ?? rel.relationship_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 border-b text-muted-foreground">{rel.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function UseCaseReportView({ result, onBack }: UseCaseReportViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-2xl font-bold">Reporte detallado — casos de uso</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportPdfButton />
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Resultados
          </Button>
        </div>
      </div>
      <Alert>
        <AlertDescription>
          Estructura detectada por el parser en la solución del docente y en el diagrama del estudiante:
          actores, casos de uso y relaciones (asociación, include, extend, etc.).
        </AlertDescription>
      </Alert>
      <div className="grid lg:grid-cols-2 gap-6">
        {result.expected_diagram ? (
          <Card className="p-4">
            <UseCaseDiagramPanel diagram={result.expected_diagram} title="Solución del docente" />
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Información del diagrama de referencia no disponible.</p>
          </Card>
        )}
        {result.student_diagram ? (
          <Card className="p-4">
            <UseCaseDiagramPanel diagram={result.student_diagram} title="Diagrama del estudiante" />
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Información del diagrama del estudiante no disponible.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
