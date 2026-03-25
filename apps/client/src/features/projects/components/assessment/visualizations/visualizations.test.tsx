/**
 * Unit tests for assessment visualizations
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { getMockAssessmentData } from '../../../mocks/assessment-mock-data';
import {
  DependencyGraph,
  MigrationTreemap,
  RiskBubbleScatter,
  CodeWaterfall,
  ReportFreshness,
  OrgHealthGauges,
  DomainRadar,
  SubscriptionCard,
  TwinFieldMatrix,
  GuidedSellingCards,
} from './index';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

const pricingDomain = assessment.domains.find((d) => d.id === 'pricing')!;
const codeDomain = assessment.domains.find((d) => d.id === 'code')!;
const productsDomain = assessment.domains.find((d) => d.id === 'products')!;
const amendmentsDomain = assessment.domains.find((d) => d.id === 'amendments')!;
const dataDomain = assessment.domains.find((d) => d.id === 'dataReporting')!;

describe('DependencyGraph', () => {
  afterEach(() => cleanup());

  it('renders graph for item with dependencies', () => {
    const item = pricingDomain.items[0]; // Enterprise Volume Discount has dependencies
    render(<DependencyGraph item={item} assessment={assessment} t={mockT} />);
    expect(screen.getByTestId('dependency-graph')).toBeTruthy();
  });

  it('renders SVG with nodes', () => {
    const item = pricingDomain.items[0];
    render(<DependencyGraph item={item} assessment={assessment} t={mockT} />);
    const svg = screen.getByRole('img');
    expect(svg).toBeTruthy();
  });

  it('shows "no dependencies" for items without deps', () => {
    const item = pricingDomain.items.find((i) => i.dependencies.length === 0)!;
    render(<DependencyGraph item={item} assessment={assessment} t={mockT} />);
    expect(screen.getByText(/No dependencies/)).toBeTruthy();
  });
});

describe('MigrationTreemap', () => {
  afterEach(() => cleanup());

  it('renders treemap', () => {
    render(
      <MigrationTreemap domains={assessment.domains} onDomainClick={vi.fn()} t={mockT} />,
    );
    expect(screen.getByTestId('migration-treemap')).toBeTruthy();
  });

  it('shows domain names', () => {
    render(
      <MigrationTreemap domains={assessment.domains} onDomainClick={vi.fn()} t={mockT} />,
    );
    const treemap = screen.getByTestId('migration-treemap');
    expect(treemap.textContent).toContain('assessment.tabs.pricing');
    expect(treemap.textContent).toContain('assessment.tabs.products');
  });

  it('shows percentages', () => {
    render(
      <MigrationTreemap domains={assessment.domains} onDomainClick={vi.fn()} t={mockT} />,
    );
    const treemap = screen.getByTestId('migration-treemap');
    expect(treemap.textContent).toContain('%');
  });

  it('renders legend with 3 status colors', () => {
    render(
      <MigrationTreemap domains={assessment.domains} onDomainClick={vi.fn()} t={mockT} />,
    );
    expect(screen.getAllByText('assessment.migrationStatus.auto').length).toBeGreaterThan(0);
    expect(screen.getAllByText('assessment.migrationStatus.guided').length).toBeGreaterThan(0);
    expect(screen.getAllByText('assessment.migrationStatus.manual').length).toBeGreaterThan(0);
  });
});

describe('RiskWaterfall (RiskBubbleScatter)', () => {
  afterEach(() => cleanup());

  it('renders risk waterfall', () => {
    render(<RiskBubbleScatter risks={assessment.risks} t={mockT} />);
    expect(screen.getByTestId('risk-bubble-scatter')).toBeTruthy();
  });

  it('shows top risks with severity badges', () => {
    render(<RiskBubbleScatter risks={assessment.risks} t={mockT} />);
    const chart = screen.getByTestId('risk-bubble-scatter');
    expect(chart.textContent).toContain('Critical');
  });

  it('shows risk descriptions', () => {
    render(<RiskBubbleScatter risks={assessment.risks} t={mockT} />);
    const chart = screen.getByTestId('risk-bubble-scatter');
    expect(chart.textContent).toContain('Calculator plugins');
  });

  it('shows category legend', () => {
    render(<RiskBubbleScatter risks={assessment.risks} t={mockT} />);
    expect(screen.getByText('assessment.riskRegister.categories.technical')).toBeTruthy();
    expect(screen.getByText('assessment.riskRegister.categories.business')).toBeTruthy();
  });

  it('shows score out of 25', () => {
    render(<RiskBubbleScatter risks={assessment.risks} t={mockT} />);
    const chart = screen.getByTestId('risk-bubble-scatter');
    expect(chart.textContent).toContain('/25');
  });

  it('limits to top 10 risks', () => {
    render(<RiskBubbleScatter risks={assessment.risks} t={mockT} />);
    const chart = screen.getByTestId('risk-bubble-scatter');
    expect(chart.textContent).toContain('Showing top 10 of 23 risks');
  });
});

describe('CodeWaterfall', () => {
  afterEach(() => cleanup());

  it('renders waterfall chart', () => {
    render(<CodeWaterfall items={codeDomain.items} t={mockT} />);
    expect(screen.getByTestId('code-waterfall')).toBeTruthy();
  });

  it('shows total LOC', () => {
    render(<CodeWaterfall items={codeDomain.items} t={mockT} />);
    const chart = screen.getByTestId('code-waterfall');
    expect(chart.textContent).toContain('LOC');
  });

  it('shows items sorted by LOC descending', () => {
    render(<CodeWaterfall items={codeDomain.items} t={mockT} />);
    const chart = screen.getByTestId('code-waterfall');
    // CPQ Quote PDF Generator (412 LOC) should appear first
    expect(chart.textContent).toContain('412 LOC');
  });

  it('returns null for items without LOC', () => {
    const { container } = render(<CodeWaterfall items={[]} t={mockT} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ReportFreshness', () => {
  afterEach(() => cleanup());

  it('renders freshness timeline', () => {
    render(<ReportFreshness reports={dataDomain.reports!} t={mockT} />);
    expect(screen.getByTestId('report-freshness')).toBeTruthy();
  });

  it('shows CPQ vs non-CPQ legend', () => {
    render(<ReportFreshness reports={dataDomain.reports!} t={mockT} />);
    expect(screen.getByText('CPQ-referencing')).toBeTruthy();
    expect(screen.getByText('Non-CPQ')).toBeTruthy();
  });

  it('shows report names', () => {
    render(<ReportFreshness reports={dataDomain.reports!} t={mockT} />);
    expect(screen.getByText('Quote Pipeline Report')).toBeTruthy();
  });
});

describe('OrgHealthGauges', () => {
  afterEach(() => cleanup());

  it('renders gauges', () => {
    render(<OrgHealthGauges orgHealth={assessment.orgHealth} t={mockT} />);
    expect(screen.getByTestId('org-health-gauges')).toBeTruthy();
  });

  it('shows API, Storage, Apex percentages', () => {
    render(<OrgHealthGauges orgHealth={assessment.orgHealth} t={mockT} />);
    const gauges = screen.getByTestId('org-health-gauges');
    expect(gauges.textContent).toContain('42%');
    expect(gauges.textContent).toContain('61%');
    expect(gauges.textContent).toContain('28%');
  });

  it('shows license counts', () => {
    render(<OrgHealthGauges orgHealth={assessment.orgHealth} t={mockT} />);
    expect(screen.getByText('58')).toBeTruthy(); // CPQ licenses
    expect(screen.getByText('0')).toBeTruthy(); // RCA licenses
  });

  it('shows billing warning', () => {
    render(<OrgHealthGauges orgHealth={assessment.orgHealth} t={mockT} />);
    expect(screen.getByText('assessment.prerequisites.billingDetected')).toBeTruthy();
  });

  it('shows RCA license as missing', () => {
    render(<OrgHealthGauges orgHealth={assessment.orgHealth} t={mockT} />);
    expect(screen.getByText('Required')).toBeTruthy();
  });
});

describe('DomainRadar', () => {
  afterEach(() => cleanup());

  it('renders radar chart', () => {
    render(<DomainRadar domains={assessment.domains} t={mockT} />);
    expect(screen.getByTestId('domain-radar')).toBeTruthy();
  });

  it('shows all domain labels', () => {
    render(<DomainRadar domains={assessment.domains} t={mockT} />);
    const radar = screen.getByTestId('domain-radar');
    expect(radar.textContent).toContain('assessment.tabs.products');
    expect(radar.textContent).toContain('assessment.tabs.pricing');
  });
});

describe('SubscriptionCard', () => {
  afterEach(() => cleanup());

  it('renders subscription card', () => {
    render(<SubscriptionCard data={amendmentsDomain.subscriptionManagement!} t={mockT} />);
    expect(screen.getByTestId('subscription-card')).toBeTruthy();
  });

  it('shows MDQ as blocker', () => {
    render(<SubscriptionCard data={amendmentsDomain.subscriptionManagement!} t={mockT} />);
    const card = screen.getByTestId('subscription-card');
    expect(card.textContent).toContain('MDQ');
    expect(card.textContent).toContain('⚠');
  });
});

describe('TwinFieldMatrix', () => {
  afterEach(() => cleanup());

  it('renders twin field matrix', () => {
    render(<TwinFieldMatrix pairs={productsDomain.twinFields!} t={mockT} />);
    expect(screen.getByTestId('twin-field-matrix')).toBeTruthy();
  });

  it('shows field pair count', () => {
    render(<TwinFieldMatrix pairs={productsDomain.twinFields!} t={mockT} />);
    expect(screen.getByText(/5 pairs/)).toBeTruthy();
  });

  it('shows sync direction arrows', () => {
    render(<TwinFieldMatrix pairs={productsDomain.twinFields!} t={mockT} />);
    const matrix = screen.getByTestId('twin-field-matrix');
    // Should have both ↔ and → arrows
    expect(matrix.textContent).toContain('↔');
    expect(matrix.textContent).toContain('→');
  });
});

describe('GuidedSellingCards', () => {
  afterEach(() => cleanup());

  it('renders guided selling cards', () => {
    render(<GuidedSellingCards flows={productsDomain.guidedSellingFlows!} t={mockT} />);
    expect(screen.getByTestId('guided-selling-cards')).toBeTruthy();
  });

  it('shows flow count', () => {
    render(<GuidedSellingCards flows={productsDomain.guidedSellingFlows!} t={mockT} />);
    expect(screen.getByText(/4 flows/)).toBeTruthy();
  });

  it('shows branching indicator', () => {
    render(<GuidedSellingCards flows={productsDomain.guidedSellingFlows!} t={mockT} />);
    // Multiple flows have branching
    expect(screen.getAllByText('Branching').length).toBeGreaterThan(0);
  });

  it('shows RCA approach', () => {
    render(<GuidedSellingCards flows={productsDomain.guidedSellingFlows!} t={mockT} />);
    const cards = screen.getByTestId('guided-selling-cards');
    expect(cards.textContent).toContain('OmniScript');
  });
});
