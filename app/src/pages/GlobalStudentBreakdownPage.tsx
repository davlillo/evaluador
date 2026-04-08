import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ComparisonResult } from '@/types/comparison';
import type { GlobalStudentResult } from '@/types/evaluation-session';

function formatScore(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toFixed(2)}%`;
}

function DiagramDetailCard({
  title,
  run,
}: {
  title: string;
  run: GlobalStudentResult['runs']['class'];
}) {
  if (run.status !== 'ok' || !run.comparison) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{run.error || 'Sin datos para este diagrama.'}</p>
        </CardContent>
      </Card>
    );
  }

  const comparison = run.comparison as ComparisonResult;
  const breakdown = comparison.breakdown as Record<string, any>;
  const [showElements, setShowElements] = useState(false);

  const summaryRows = useMemo(() => {
    if (comparison.diagram_type === 'class') {
      return [
        { label: 'Clases', val: `${breakdown.classes?.correct ?? 0}/${breakdown.classes?.expected ?? 0}` },
        { label: 'Atributos', val: `${breakdown.attributes?.correct ?? 0}/${breakdown.attributes?.expected ?? 0}` },
        { label: 'Métodos', val: `${breakdown.methods?.correct ?? 0}/${breakdown.methods?.expected ?? 0}` },
        { label: 'Relaciones', val: `${breakdown.relationships?.correct ?? 0}/${breakdown.relationships?.expected ?? 0}` },
      ];
    }
    if (comparison.diagram_type === 'usecase') {
      return [
        { label: 'Actores', val: `${breakdown.actors?.correct ?? 0}/${breakdown.actors?.expected ?? 0}` },
        { label: 'Casos de uso', val: `${breakdown.use_cases?.correct ?? 0}/${breakdown.use_cases?.expected ?? 0}` },
        { label: 'Relaciones', val: `${breakdown.relationships?.correct ?? 0}/${breakdown.relationships?.expected ?? 0}` },
      ];
    }
    return [
      { label: 'Lifelines', val: `${breakdown.lifelines?.correct ?? 0}/${breakdown.lifelines?.expected ?? 0}` },
      { label: 'Mensajes', val: `${breakdown.messages?.correct ?? 0}/${breakdown.messages?.expected ?? 0}` },
      { label: 'Orden de mensajes', val: formatScore(breakdown.messages?.order_score) },
    ];
  }, [comparison.diagram_type, breakdown]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          Similitud: <strong className="text-foreground">{formatScore(run.similarity)}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {summaryRows.map((r) => (
          <div key={r.label} className="flex items-center justify-between border rounded-md p-2 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium">{r.val}</span>
          </div>
        ))}

        <Button size="sm" variant="outline" onClick={() => setShowElements((v) => !v)}>
          {showElements ? 'Ocultar detalle de elementos' : 'Mostrar detalle de elementos'}
        </Button>

        {showElements && (
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {comparison.details.map((d, i) => (
              <div key={`${d.name}-${i}`} className="border rounded-md p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{d.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {d.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">{d.message}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function GlobalStudentBreakdownPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const student = (location.state as { student?: GlobalStudentResult } | null)?.student;

  if (!student) {
    return <Navigate to="/evaluar/global" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => navigate('/evaluar/global')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a resultados globales
        </Button>
        <Badge variant={student.complete ? 'default' : 'secondary'}>
          {student.complete ? 'Completo' : 'Incompleto'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="w-5 h-5" />
            Desglose de nota estudiante: {student.student_id}
          </CardTitle>
          <CardDescription>
            Nota global final: <strong className="text-foreground">{formatScore(student.final_score)}</strong>
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <DiagramDetailCard title="Diagrama de clases" run={student.runs.class} />
        <DiagramDetailCard title="Diagrama de casos de uso" run={student.runs.usecase} />
        <DiagramDetailCard title="Diagrama de secuencia" run={student.runs.sequence} />
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <LayoutGrid className="w-3.5 h-3.5" />
        Vista unificada de los 3 tipos, basada en la misma lógica de evaluación individual.
      </p>
    </div>
  );
}
