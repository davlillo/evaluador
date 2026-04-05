import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Box, CircleDot, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvaluationWizard } from '@/context/EvaluationWizardContext';
import type { DiagramKind } from '@/types/diagram';

const OPTIONS: {
  kind: DiagramKind;
  title: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    kind: 'class',
    title: 'Diagrama de clases',
    description: 'Clases, atributos, métodos y relaciones entre clases.',
    icon: <Box className="w-10 h-10 text-blue-600" />,
  },
  {
    kind: 'usecase',
    title: 'Casos de uso',
    description: 'Actores, casos de uso y relaciones (include, extend, asociación).',
    icon: <CircleDot className="w-10 h-10 text-emerald-600" />,
  },
  {
    kind: 'sequence',
    title: 'Diagrama de secuencia',
    description: 'Líneas de vida, mensajes y orden (comparación en evolución).',
    icon: <GitBranch className="w-10 h-10 text-violet-600" />,
  },
];

export default function DiagramTypePage() {
  const navigate = useNavigate();
  const { setDiagramKind } = useEvaluationWizard();

  const select = (kind: DiagramKind) => {
    setDiagramKind(kind);
    navigate('/evaluar/subir');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">¿Qué tipo de diagrama vas a evaluar?</h2>
        <p className="text-muted-foreground text-sm">
          Elige el tipo antes de configurar ponderaciones y subir archivos. El archivo XMI debe corresponder
          a ese tipo.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {OPTIONS.map(({ kind, title, description, icon }) => (
          <Card
            key={kind}
            className="cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <button type="button" className="text-left w-full p-0" onClick={() => select(kind)}>
              <CardHeader>
                <div className="mb-2">{icon}</div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-xs">{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">Continuar →</span>
              </CardContent>
            </button>
          </Card>
        ))}
      </div>
      <div className="flex justify-center">
        <Button variant="ghost" onClick={() => navigate('/evaluar/modo')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
      </div>
    </div>
  );
}
