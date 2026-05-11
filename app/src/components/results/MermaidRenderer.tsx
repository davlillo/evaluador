import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryBorderColor: '#2563eb',
    primaryTextColor: '#1e293b',
    lineColor: '#94a3b8',
    secondaryColor: '#f1f5f9',
    tertiaryColor: '#f8fafc',
  },
});

export function MermaidRenderer({ chart, id }: { chart: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevChart = useRef('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current || !chart) return;
    if (prevChart.current === chart) return;
    prevChart.current = chart;

    mermaid.render(`mermaid-${id}`, chart)
      .then(({ svg }) => {
        if (ref.current) {
          ref.current.innerHTML = svg;
        }
      })
      .catch((err: Error) => {
        console.error('Mermaid render error:', err);
        setError(err.message || 'Error al renderizar el diagrama');
      });
  }, [chart, id]);

  if (error) {
    return (
      <div className="w-full overflow-auto py-2 flex justify-center">
        <div className="text-red-500 text-sm p-2 rounded border border-red-300 bg-red-50">
          Error al renderizar: {error}
        </div>
      </div>
    );
  }

  return <div ref={ref} className="w-full overflow-auto py-2 flex justify-center" />;
}

export function buildClassDiagramMermaid(
  classes: Array<{ name: string; attributes?: Array<{ name: string; type?: string; visibility?: string }>; methods?: Array<{ name: string; return_type?: string; visibility?: string }>; is_abstract?: boolean; is_interface?: boolean }>,
  relationships: Array<{ source: string; target: string; relationship_type: string; name?: string | null; source_multiplicity?: string | null; target_multiplicity?: string | null }>,
): string {
  const lines: string[] = ['classDiagram'];

  for (const cls of classes) {
    const vis = (v?: string) => (v === 'public' ? '+' : v === 'private' ? '-' : v === 'protected' ? '#' : '+');
    const label = cls.is_interface ? '<<interface>>' : cls.is_abstract ? '<<abstract>>' : '';
    let hasBlock = false;

    if (label) {
      lines.push(`  class ${cls.name} {`);
      hasBlock = true;
      lines.push(`    ${label}`);
    } else if (cls.attributes && cls.attributes.length > 0) {
      lines.push(`  class ${cls.name} {`);
      hasBlock = true;
    } else {
      lines.push(`  class ${cls.name}`);
    }

    if (cls.attributes && cls.attributes.length > 0) {
      for (const attr of cls.attributes) {
        const typeStr = attr.type ? `: ${attr.type}` : '';
        lines.push(`    ${vis(attr.visibility)}${attr.name}${typeStr}`);
      }
    }

    if (hasBlock) {
      lines.push(`  }`);
    }
  }

  for (const rel of relationships) {
    const typeMap: Record<string, string> = {
      association: '-->',
      inheritance: '<|--',
      implementation: '<|..',
      dependency: '..>',
      aggregation: 'o--',
      composition: '*--',
      include: '..>',
      extend: '..|>',
    };
    const arrow = typeMap[rel.relationship_type] || '-->';
    const srcMult = rel.source_multiplicity ? ` "${rel.source_multiplicity}"` : '';
    const tgtMult = rel.target_multiplicity ? ` "${rel.target_multiplicity}"` : '';
    const relName = rel.name ? ` : ${rel.name}` : '';
    lines.push(`  ${rel.source}${srcMult} ${arrow}${tgtMult} ${rel.target}${relName}`);
  }

  return lines.join('\n');
}

function sanitizeId(name: string): string {
  return name.replace(/[\s+%\/@#$&]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function buildUseCaseDiagramMermaid(
  actors: Array<{ name: string }>,
  useCases: Array<{ name: string }>,
  relationships: Array<{ source: string; target: string; relationship_type: string }>,
): string {
  const lines: string[] = ['graph TD'];

  for (const actor of actors) {
    const id = sanitizeId(actor.name);
    lines.push(`  ${id}["${actor.name}"]`);
  }

  for (const uc of useCases) {
    const id = sanitizeId(uc.name);
    lines.push(`  ${id}(["${uc.name}"])`);
  }

  const typeMap: Record<string, string> = {
    association: '-->',
    include: '-.->',
    extend: '-->',
  };

  for (const rel of relationships) {
    const src = sanitizeId(rel.source);
    const tgt = sanitizeId(rel.target);
    const arrow = typeMap[rel.relationship_type] || '-->';
    lines.push(`  ${src} ${arrow} ${tgt}`);
  }

  return lines.join('\n');
}

export function buildSequenceDiagramMermaid(
  lifelines: Array<{ name: string }>,
  messages: Array<{ name: string; source_lifeline: string; target_lifeline: string }>,
): string {
  const lines: string[] = ['sequenceDiagram'];

  for (const ll of lifelines) {
    lines.push(`  participant ${sanitizeId(ll.name)} as "${ll.name}"`);
  }

  for (const msg of messages) {
    const src = sanitizeId(msg.source_lifeline);
    const tgt = sanitizeId(msg.target_lifeline);
    const arrow = '->>';
    lines.push(`  ${src}${arrow}${tgt}: ${msg.name}`);
  }

  return lines.join('\n');
}