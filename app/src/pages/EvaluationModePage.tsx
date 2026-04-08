import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Layers } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEvaluationWizard } from '@/context/EvaluationWizardContext';
import type { XmiSource } from '@/types/evaluation-session';

export default function EvaluationModePage() {
  const navigate = useNavigate();
  const { setMode, setXmiSource } = useEvaluationWizard();
  const [globalSourceDialogOpen, setGlobalSourceDialogOpen] = useState(false);

  const chooseSingle = () => {
    setMode('single');
    navigate('/evaluar/tipo');
  };

  const chooseGlobal = () => {
    setMode('global');
    setGlobalSourceDialogOpen(true);
  };

  const chooseGlobalSource = (source: XmiSource) => {
    setMode('global');
    setXmiSource(source);
    setGlobalSourceDialogOpen(false);
    navigate('/evaluar/global');
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Modo de evaluación</h2>
        <p className="text-muted-foreground text-sm">
          Elige si vas a calificar un solo tipo de diagrama o una evaluación compuesta.
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
        <Card className="border-2 border-primary/20 cursor-pointer hover:bg-muted/30 transition-colors">
          <button type="button" className="text-left w-full" onClick={chooseGlobal}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <GitBranch className="w-8 h-8 text-primary" />
                <CardTitle className="text-lg">Varios tipos / nota global</CardTitle>
              </div>
              <CardDescription>
                Reparte el 100% entre clases, casos de uso y secuencia. Sube 3 soluciones y 3 ZIP de
                estudiantes para generar ranking global por carnet.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Badge>Disponible</Badge>
            </CardContent>
          </button>
        </Card>
      </div>

      <Dialog open={globalSourceDialogOpen} onOpenChange={setGlobalSourceDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Selecciona el origen del XMI</DialogTitle>
            <DialogDescription>
              Antes de cargar los 6 archivos del módulo global, elige si serán de Astah o Visual Paradigm.
            </DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <Button type="button" onClick={() => chooseGlobalSource('astah')}>
              Astah
            </Button>
            <Button type="button" variant="outline" onClick={() => chooseGlobalSource('visual_paradigm')}>
              Visual Paradigm
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setGlobalSourceDialogOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
