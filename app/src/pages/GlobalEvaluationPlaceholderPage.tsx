import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { GlobalDiagramWeights } from '@/types/evaluation-session';
import { useState } from 'react';

const defaultWeights: GlobalDiagramWeights = {
  class: 40,
  usecase: 35,
  sequence: 25,
};

export default function GlobalEvaluationPlaceholderPage() {
  const navigate = useNavigate();
  const [w, setW] = useState<GlobalDiagramWeights>(defaultWeights);
  const total = w.class + w.usecase + w.sequence;
  const valid = Math.abs(total - 100) < 0.01;

  const setField = (key: keyof GlobalDiagramWeights, value: string) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    setW((prev) => ({ ...prev, [key]: n }));
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <Construction className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
          <CardTitle>Evaluación compuesta</CardTitle>
          <CardDescription>
            Aquí el docente podrá repartir el 100% de la nota entre diagrama de clases, casos de uso y
            secuencia, y subir un ZIP por cada tipo. La agregación y la subida múltiple llegarán en una
            siguiente versión.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Modelo previsto: nota global = Σ (similitud del diagrama i × peso global i). Los pesos locales
              de cada diagrama se configuran antes de cada comparación.
            </AlertDescription>
          </Alert>
          <div className="space-y-3">
            <p className="text-sm font-medium">Reparto global (demo visual, no se guarda)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="gw-class">Clases %</Label>
                <Input
                  id="gw-class"
                  type="number"
                  min={0}
                  max={100}
                  value={w.class}
                  onChange={(e) => setField('class', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="gw-uc">Casos de uso %</Label>
                <Input
                  id="gw-uc"
                  type="number"
                  min={0}
                  max={100}
                  value={w.usecase}
                  onChange={(e) => setField('usecase', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="gw-seq">Secuencia %</Label>
                <Input
                  id="gw-seq"
                  type="number"
                  min={0}
                  max={100}
                  value={w.sequence}
                  onChange={(e) => setField('sequence', e.target.value)}
                />
              </div>
            </div>
            <p className={'text-sm ' + (valid ? 'text-green-600' : 'text-destructive')}>
              Total: {total}% {valid ? '(válido)' : '(debe sumar 100%)'}
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => navigate('/evaluar/modo')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al modo de evaluación
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
