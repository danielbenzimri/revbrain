/**
 * Dependency Impact Graph
 *
 * Local dependency graph (1-2 hops) showing how items connect across
 * domains. Nodes colored by domain, edges show direction.
 * This is the feature that makes GUI fundamentally superior to PDF.
 */
import { useMemo } from 'react';
import type { AssessmentItem, AssessmentData, DomainId } from '../../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  label: string;
  type: string; // domain or item type
  domainId: DomainId | 'field' | 'external';
  x: number;
  y: number;
  isCentral: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  style: 'solid' | 'dashed';
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

function buildGraph(
  item: AssessmentItem,
  assessment: AssessmentData
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  // Find which domain this item belongs to
  let itemDomain: DomainId = 'products';
  for (const domain of assessment.domains) {
    if (domain.items.find((i) => i.id === item.id)) {
      itemDomain = domain.id;
      break;
    }
  }

  // Central node
  nodes.push({
    id: item.id,
    label: item.name,
    type: itemDomain,
    domainId: itemDomain,
    x: 50,
    y: 50,
    isCentral: true,
  });
  seen.add(item.id);

  // Dependencies as child nodes
  const depCount = item.dependencies.length;
  item.dependencies.forEach((depName, i) => {
    const depId = `dep-${i}`;
    const angle = (2 * Math.PI * i) / Math.max(depCount, 1) - Math.PI / 2;
    const radius = 35;

    // Try to find the dependency in assessment data to determine its domain
    let depDomain: DomainId | 'field' | 'external' = 'external';
    for (const domain of assessment.domains) {
      const found = domain.items.find(
        (it) => it.name === depName || it.apiName.includes(depName.replace('.cls', ''))
      );
      if (found) {
        depDomain = domain.id;
        break;
      }
    }

    // Check if it's a field reference
    if (depName.includes('__c') || depName.includes('Field')) {
      depDomain = 'field';
    }

    nodes.push({
      id: depId,
      label: depName,
      type: depDomain,
      domainId: depDomain,
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle),
      isCentral: false,
    });

    edges.push({ from: item.id, to: depId, style: 'solid' });
    seen.add(depId);
  });

  // Find items that reference this item (reverse dependencies)
  for (const domain of assessment.domains) {
    for (const otherItem of domain.items) {
      if (otherItem.id === item.id) continue;
      if (otherItem.dependencies.some((d) => d === item.name || item.name.includes(d))) {
        if (!seen.has(otherItem.id)) {
          const idx = nodes.length;
          const angle = Math.PI + idx * 0.8;
          const radius = 38;
          nodes.push({
            id: otherItem.id,
            label: otherItem.name,
            type: domain.id,
            domainId: domain.id,
            x: 50 + radius * Math.cos(angle),
            y: 50 + radius * Math.sin(angle),
            isCentral: false,
          });
          edges.push({ from: otherItem.id, to: item.id, style: 'dashed' });
          seen.add(otherItem.id);
        }
      }
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DependencyGraphProps {
  item: AssessmentItem;
  assessment: AssessmentData;
  compact?: boolean; // true = smaller version for slide-over
  t: (key: string) => string;
}

export default function DependencyGraph({
  item,
  assessment,
  compact = false,
  t,
}: DependencyGraphProps) {
  const { nodes, edges } = useMemo(() => buildGraph(item, assessment), [item, assessment]);

  if (nodes.length <= 1) {
    return <div className="text-center py-4 text-sm text-slate-400">No dependencies detected</div>;
  }

  const size = compact ? 280 : 440;

  return (
    <div className="bg-white rounded-2xl p-4" data-testid="dependency-graph">
      {!compact && (
        <h3 className="text-sm font-semibold text-slate-900 mb-3">
          {t('assessment.itemDetail.dependencies')}
        </h3>
      )}

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="mx-auto"
        role="img"
        aria-label={`Dependency graph for ${item.name}`}
      >
        {/* Edges */}
        {edges.map((edge, i) => {
          const fromNode = nodes.find((n) => n.id === edge.from);
          const toNode = nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;
          return (
            <line
              key={`edge-${i}`}
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
              stroke={edge.style === 'dashed' ? '#94a3b8' : '#cbd5e1'}
              strokeWidth={0.4}
              strokeDasharray={edge.style === 'dashed' ? '1.5,1' : undefined}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const r = node.isCentral ? 8 : 5.5;
          const fillColor = node.isCentral
            ? '#8b5cf6' // violet for central
            : node.domainId === 'pricing'
              ? '#f59e0b'
              : node.domainId === 'code'
                ? '#ef4444'
                : node.domainId === 'products'
                  ? '#3b82f6'
                  : node.domainId === 'rules'
                    ? '#8b5cf6'
                    : node.domainId === 'integrations'
                      ? '#06b6d4'
                      : node.domainId === 'amendments'
                        ? '#f97316'
                        : node.domainId === 'approvals'
                          ? '#ec4899'
                          : node.domainId === 'documents'
                            ? '#10b981'
                            : '#94a3b8';

          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={fillColor}
                fillOpacity={node.isCentral ? 0.15 : 0.1}
                stroke={fillColor}
                strokeWidth={node.isCentral ? 0.6 : 0.4}
              />
              <text
                x={node.x}
                y={node.y + r + 2.5}
                textAnchor="middle"
                fontSize={compact ? 2.2 : 2.5}
                fill="#475569"
                fontWeight={node.isCentral ? 600 : 400}
              >
                {node.label.length > 20 ? node.label.slice(0, 18) + '...' : node.label}
              </text>
              {node.isCentral && (
                <text
                  x={node.x}
                  y={node.y + r + 5}
                  textAnchor="middle"
                  fontSize={1.8}
                  fill="#94a3b8"
                >
                  {t(`assessment.tabs.${node.domainId}`)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      {!compact && (
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-slate-300 inline-block" /> Direct dependency
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-3 h-0.5 bg-slate-300 inline-block border-dashed border-t border-slate-400"
              style={{ borderStyle: 'dashed' }}
            />{' '}
            Referenced by
          </span>
        </div>
      )}
    </div>
  );
}
