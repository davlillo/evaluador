import { useState } from 'react';
import { ArrowLeft, Code, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { DiagramInfo, DiagramClass } from '@/types/comparison';

const visSymbol: Record<string, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};

const relLabel: Record<string, string> = {
  inheritance: 'Herencia',
  association: 'Asociación',
  aggregation: 'Agregación',
  composition: 'Composición',
  dependency: 'Dependencia',
  implementation: 'Realización',
};

interface ReportPageProps {
  result: any;
  onBack: () => void;
}

function DiagramClassRow({ cls }: { cls: DiagramClass }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors bg-muted/20" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-mono font-semibold text-sm">{cls.name}</span>
          {cls.is_abstract && <Badge variant="outline" className="text-xs">abstract</Badge>}
          {cls.is_interface && <Badge variant="outline" className="text-xs border-blue-400 text-blue-600">interface</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{cls.attributes.length} attr.</span>
          <span>{cls.methods.length} mét.</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-3 pt-2 grid md:grid-cols-2 gap-4 border-t bg-background">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Atributos</p>
            {cls.attributes.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Sin atributos</p>
            ) : (
              <ul className="space-y-1">
                {cls.attributes.map((attr, i) => (
                  <li key={i} className="font-mono text-xs flex items-baseline gap-1">
                    <span className="text-muted-foreground w-3 flex-shrink-0">{visSymbol[attr.visibility] ?? '?'}</span>
                    <span className="font-medium">{attr.name}</span>
                    {attr.type && <span className="text-muted-foreground">: {attr.type}</span>}
                    {attr.is_static && <span className="text-blue-500 text-[10px]">static</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Métodos</p>
            {cls.methods.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Sin métodos</p>
            ) : (
              <ul className="space-y-1">
                {cls.methods.map((method, i) => {
                  const params = method.parameters.map((p) => `${p.name}${p.type ? ': ' + p.type : ''}`).join(', ');
                  return (
                    <li key={i} className="font-mono text-xs flex items-baseline gap-1 flex-wrap">
                      <span className="text-muted-foreground w-3 flex-shrink-0">{visSymbol[method.visibility] ?? '?'}</span>
                      <span className="font-medium">{method.name}</span>
                      <span className="text-muted-foreground">({params})</span>
                      {method.return_type && method.return_type !== 'void' && (
                        <span className="text-muted-foreground">: {method.return_type}</span>
                      )}
                      {method.is_abstract && <span className="text-orange-500 text-[10px]">abstract</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DiagramReport({ diagram, title }: { diagram: DiagramInfo; title: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{diagram.classes.length} clases</Badge>
          <Badge variant="secondary">{diagram.classes.reduce((s, c) => s + c.attributes.length, 0)} atributos</Badge>
          <Badge variant="secondary">{diagram.classes.reduce((s, c) => s + c.methods.length, 0)} métodos</Badge>
          <Badge variant="secondary">{diagram.relationships.length} relaciones</Badge>
        </div>
      </div>
      {diagram.classes.length === 0 ? (
        <Alert><AlertDescription>No se detectaron clases en este diagrama.</AlertDescription></Alert>
      ) : (
        <div className="space-y-2">
          {diagram.classes.map((cls, i) => (<DiagramClassRow key={i} cls={cls} />))}
        </div>
      )}
      {diagram.relationships.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Relaciones detectadas</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left px-3 py-2 font-medium border">Origen</th>
                  <th className="text-left px-3 py-2 font-medium border">Destino</th>
                  <th className="text-left px-3 py-2 font-medium border">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium border">Card. Origen</th>
                  <th className="text-left px-3 py-2 font-medium border">Card. Destino</th>
                  <th className="text-left px-3 py-2 font-medium border">Nombre</th>
                </tr>
              </thead>
              <tbody>
                {diagram.relationships.map((rel, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="px-3 py-1.5 border font-mono">{rel.source}</td>
                    <td className="px-3 py-1.5 border font-mono">{rel.target}</td>
                    <td className="px-3 py-1.5 border">
                      <Badge variant="outline" className="text-[10px]">{relLabel[rel.relationship_type] ?? rel.relationship_type}</Badge>
                    </td>
                    <td className="px-3 py-1.5 border font-mono text-center">{(rel as any).source_multiplicity || '-'}</td>
                    <td className="px-3 py-1.5 border font-mono text-center">{(rel as any).target_multiplicity || '-'}</td>
                    <td className="px-3 py-1.5 border text-muted-foreground">{rel.name ?? '-'}</td>
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

export default function ReportPage({ result, onBack }: ReportPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Reporte Completo</h2>
        <Button onClick={onBack} variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Volver a Resultados</Button>
      </div>
      <Alert>
        <AlertDescription>Este reporte muestra la estructura completa detectada en cada diagrama. Úsalo para verificar que el parser leyó correctamente ambos archivos.</AlertDescription>
      </Alert>
      <div className="grid lg:grid-cols-2 gap-6">
        {result.expected_diagram ? (
          <Card className="p-4"><DiagramReport diagram={result.expected_diagram} title="Solución del docente" /></Card>
        ) : (
          <Card className="p-4"><p className="text-sm text-muted-foreground">Información del diagrama de referencia no disponible.</p></Card>
        )}
        {result.student_diagram ? (
          <Card className="p-4"><DiagramReport diagram={result.student_diagram} title="Diagrama del estudiante" /></Card>
        ) : (
          <Card className="p-4"><p className="text-sm text-muted-foreground">Información del diagrama del estudiante no disponible.</p></Card>
        )}
      </div>
    </div>
  );
}
