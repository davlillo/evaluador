import { useEffect, useRef } from 'react';
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
  const hasRendered = useRef(false);

  useEffect(() => {
    if (!ref.current || hasRendered.current) return;
    hasRendered.current = true;

    mermaid.render(`mermaid-${id}`, chart).then(({ svg }) => {
      if (ref.current) {
        ref.current.innerHTML = svg;
      }
    });
  }, [chart, id]);

  return <div ref={ref} className="w-full overflow-auto py-2 flex justify-center" />;
}

export function buildClassDiagramMermaid(
  classes: Array<{ name: string; attributes?: Array<{ name: string; type?: string; visibility?: string }>; methods?: Array<{ name: string; return_type?: string; visibility?: string }>; is_abstract?: boolean; is_interface?: boolean }>,
  relationships: Array<{ source: string; target: string; relationship_type: string; name?: string | null }>,
): string {
  const lines: string[] = ['classDiagram'];

  for (const cls of classes) {
    const vis = (v?: string) => (v === 'public' ? '+' : v === 'private' ? '-' : v === 'protected' ? '#' : '+');
    const label = cls.is_interface ? '<<interface>>' : cls.is_abstract ? '<<abstract>>' : '';

    if (label) {
      lines.push(`  class ${cls.name} {`);
      lines.push(`    ${label}`);
    } else {
      lines.push(`  class ${cls.name}`);
    }

    if (cls.attributes && cls.attributes.length > 0) {
      if (!label) lines.push(`  class ${cls.name} {`);
      for (const attr of cls.attributes) {
        const typeStr = attr.type ? `: ${attr.type}` : '';
        lines.push(`    ${vis(attr.visibility)}${attr.name}${typeStr}`);
      }
      if (!label) lines.push(`  }`);
    } else if (label) {
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
    const relName = rel.name ? ` : ${rel.name}` : '';
    lines.push(`  ${rel.source} ${arrow} ${rel.target}${relName}`);
  }

  return lines.join('\n');
}

export function buildUseCaseDiagramMermaid(
  actors: Array<{ name: string }>,
  useCases: Array<{ name: string }>,
  relationships: Array<{ source: string; target: string; relationship_type: string }>,
): string {
  const lines: string[] = ['graph TD'];

  for (const actor of actors) {
    lines.push(`  ${actor.name.replace(/\s+/g, '_')}["${actor.name}"]`);
  }

  for (const uc of useCases) {
    lines.push(`  ${uc.name.replace(/\s+/g, '_')}(["${uc.name}"])`);
  }

  for (const rel of relationships) {
    const src = rel.source.replace(/\s+/g, '_');
    const tgt = rel.target.replace(/\s+/g, '_');
    lines.push(`  ${src} --> ${tgt}`);
  }

  return lines.join('\n');
}

export function buildSequenceDiagramMermaid(
  lifelines: Array<{ name: string }>,
  messages: Array<{ name: string; source_lifeline: string; target_lifeline: string }>,
): string {
  const lines: string[] = ['sequenceDiagram'];

  for (const ll of lifelines) {
    lines.push(`  participant ${ll.name.replace(/\s+/g, '_')} as ${ll.name}`);
  }

  for (const msg of messages) {
    const src = msg.source_lifeline.replace(/\s+/g, '_');
    const tgt = msg.target_lifeline.replace(/\s+/g, '_');
    const arrow = '->>';
    lines.push(`  ${src}${arrow}${tgt}: ${msg.name}`);
  }

  return lines.join('\n');
}