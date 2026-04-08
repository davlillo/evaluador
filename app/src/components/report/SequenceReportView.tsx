import { ArrowLeft, ArrowRightLeft, GitBranch, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportPdfButton } from '@/components/report/ExportPdfButton';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { DiagramInfo } from '@/types/comparison';

interface SequenceReportViewProps {
  result: {
    expected_diagram?: DiagramInfo;
    student_diagram?: DiagramInfo;
  };
  onBack: () => void;
}

function DiagramPanel({ diagram, title }: { diagram: DiagramInfo; title: string }) {
  const lifelines = diagram.lifelines ?? [];
  const messages = [...(diagram.messages ?? [])].sort((a, b) => a.sequence_order - b.sequence_order);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-normal">
            {diagram.name || 'Sin nombre'}
          </Badge>
          <Badge variant="secondary">{lifelines.length} líneas de vida</Badge>
          <Badge variant="secondary">{messages.length} mensajes</Badge>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5" /> Líneas de vida
        </p>
        {lifelines.length === 0 ? (
          <Alert>
            <AlertDescription className="text-xs">No se detectaron líneas de vida.</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lifelines.map((line, index) => (
              <Badge key={index} variant="outline" className="font-mono text-xs font-normal">
                {line.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
          <MessageSquareText className="w-3.5 h-3.5" /> Mensajes (ordenados)
        </p>
        {messages.length === 0 ? (
          <Alert>
            <AlertDescription className="text-xs">No se detectaron mensajes.</AlertDescription>
          </Alert>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left px-3 py-2 font-medium border-b">#</th>
                  <th className="text-left px-3 py-2 font-medium border-b">Mensaje</th>
                  <th className="text-left px-3 py-2 font-medium border-b">Flujo</th>
                  <th className="text-left px-3 py-2 font-medium border-b">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((message, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="px-3 py-1.5 border-b font-mono">{message.sequence_order + 1}</td>
                    <td className="px-3 py-1.5 border-b font-mono">{message.name || '(sin nombre)'}</td>
                    <td className="px-3 py-1.5 border-b">
                      <span className="inline-flex items-center gap-1 font-mono">
                        {message.source_lifeline || '?'}
                        <ArrowRightLeft className="w-3 h-3" />
                        {message.target_lifeline || '?'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 border-b text-muted-foreground">
                      {message.message_sort || 'synchCall'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function SequenceReportView({ result, onBack }: SequenceReportViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-2xl font-bold">Reporte detallado — secuencia</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportPdfButton />
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Resultados
          </Button>
        </div>
      </div>

      <Alert>
        <AlertDescription>
          Vista comparativa de lo que leyó el parser para Visual Paradigm/Astah: líneas de vida y mensajes con su
          orden de ejecución.
        </AlertDescription>
      </Alert>

      <div className="grid lg:grid-cols-2 gap-6">
        {result.expected_diagram ? (
          <Card className="p-4">
            <DiagramPanel diagram={result.expected_diagram} title="Solución del docente" />
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Información del diagrama de referencia no disponible.</p>
          </Card>
        )}
        {result.student_diagram ? (
          <Card className="p-4">
            <DiagramPanel diagram={result.student_diagram} title="Diagrama del estudiante" />
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
