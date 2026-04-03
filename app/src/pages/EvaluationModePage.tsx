import { useNavigate } from 'react-router-dom';
import { GitBranch, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEvaluationWizard } from '@/context/EvaluationWizardContext';

export default function EvaluationModePage() {
  const navigate = useNavigate();
  const { setMode } = useEvaluationWizard();

  const chooseSingle = () => {
    setMode('single');
    navigate('/evaluar/tipo');
  };

  const chooseGlobal = () => {
    navigate('/evaluar/global');
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Modo de evaluación</h2>
        <p className="text-muted-foreground text-sm">
          Elige si vas a calificar un solo tipo de diagrama o una evaluación compuesta (próximamente).
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-2 border-primary/30 cursor-pointer hover:bg-muted/40 transition-colors">
          <button type="button" className="text-left w-full" onClick={chooseSingle}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers className="w-8 h-8 text-primary" />
                <CardTitle className="text-lg">Un solo tipo</CardTitle>
              </div>
              <CardDescription>
                Seleccionas diagrama de clases, casos de uso o secuencia y subes los archivos XMI/XML
                correspondientes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge>Disponible</Badge>
            </CardContent>
          </button>
        </Card>
        <Card className="opacity-80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <GitBranch className="w-8 h-8 text-muted-foreground" />
              <CardTitle className="text-lg">Varios tipos / nota global</CardTitle>
            </div>
            <CardDescription>
              Reparte el 100% entre diagramas de clases, casos de uso y secuencia; subida de varios ZIP
              (en desarrollo).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Badge variant="secondary">Próximamente</Badge>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={chooseGlobal}>
              Ver avance
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
