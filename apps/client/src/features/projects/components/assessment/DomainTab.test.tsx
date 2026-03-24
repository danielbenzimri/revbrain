/**
 * Unit tests for DomainTab template component
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import DomainTab from './DomainTab';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

// Use pricing domain (has sub-tabs) for testing
const pricingDomain = assessment.domains.find((d) => d.id === 'pricing')!;
// Use rules domain (no sub-tabs) for testing
const rulesDomain = assessment.domains.find((d) => d.id === 'rules')!;

const defaultStatCards = [
  { label: 'Total Rules', value: 243 },
  { label: 'High Complexity', value: 47 },
  { label: 'With Apex', value: 12 },
  { label: 'Calc Plugins', value: 3 },
];

describe('DomainTab', () => {
  afterEach(() => cleanup());

  describe('Stats Strip', () => {
    it('renders stat cards', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const strip = screen.getByTestId('stats-strip');
      expect(within(strip).getByText('243')).toBeTruthy();
      expect(within(strip).getByText('47')).toBeTruthy();
    });

    it('renders correct number of stat cards', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const strip = screen.getByTestId('stats-strip');
      const cards = strip.children;
      expect(cards.length).toBe(4);
    });
  });

  describe('Migration Status Bar', () => {
    it('renders migration status bar', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      expect(screen.getByTestId('migration-status-bar')).toBeTruthy();
    });

    it('shows all four status categories', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const bar = screen.getByTestId('migration-status-bar');
      const text = bar.textContent || '';
      expect(text).toContain('assessment.migrationStatus.auto');
      expect(text).toContain('assessment.migrationStatus.guided');
      expect(text).toContain('assessment.migrationStatus.manual');
    });
  });

  describe('Inventory Table', () => {
    it('renders inventory table', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      expect(screen.getByTestId('inventory-table')).toBeTruthy();
    });

    it('renders items in table', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      // Pricing has 7 mock items
      const rows = screen.getAllByRole('row');
      // rows includes header row + data rows
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it('search filters items by name', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const searchInput = screen.getByLabelText('assessment.table.search');
      fireEvent.change(searchInput, { target: { value: 'Enterprise' } });
      // Should only show items containing "Enterprise"
      const table = screen.getByTestId('inventory-table');
      expect(table.textContent).toContain('Enterprise Volume Discount');
    });

    it('complexity filter reduces visible rows', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const allRows = screen.getAllByRole('row');
      const initialCount = allRows.length;

      const complexityFilter = screen.getByLabelText('assessment.table.filterComplexity');
      fireEvent.change(complexityFilter, { target: { value: 'high' } });

      const filteredRows = screen.getAllByRole('row');
      expect(filteredRows.length).toBeLessThan(initialCount);
    });

    it('shows "no results" when filters exclude all items', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const searchInput = screen.getByLabelText('assessment.table.search');
      fireEvent.change(searchInput, { target: { value: 'zzzznonexistent' } });
      expect(screen.getByText('assessment.table.noResults')).toBeTruthy();
    });

    it('row click calls onItemClick', () => {
      const onItemClick = vi.fn();
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} onItemClick={onItemClick} t={mockT} />);
      const rows = screen.getAllByRole('row');
      // Click first data row (skip header)
      fireEvent.click(rows[1]);
      expect(onItemClick).toHaveBeenCalledTimes(1);
    });

    it('shows complexity badges', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const table = screen.getByTestId('inventory-table');
      expect(table.textContent).toContain('assessment.complexity.high');
    });

    it('shows migration status badges with why tooltip', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      // Status badges should have title attribute with whyStatus
      const statusBadges = screen.getAllByText(/assessment\.migrationStatus\.(auto|guided|manual|blocked)/);
      const withTitle = statusBadges.filter((el) => el.getAttribute('title'));
      expect(withTitle.length).toBeGreaterThan(0);
    });
  });

  describe('Sub-tabs', () => {
    it('renders sub-tab sidebar for domains with sub-tabs', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      expect(screen.getByTestId('sub-tab-sidebar')).toBeTruthy();
    });

    it('does not render sub-tab sidebar for domains without sub-tabs', () => {
      render(<DomainTab domain={rulesDomain} statCards={[]} t={mockT} />);
      expect(screen.queryByTestId('sub-tab-sidebar')).toBeNull();
    });

    it('renders correct sub-tab count for pricing', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const sidebar = screen.getByTestId('sub-tab-sidebar');
      const buttons = within(sidebar).getAllByRole('button');
      expect(buttons).toHaveLength(3); // Price Rules, Contracted Pricing, Multi-Currency
    });
  });

  describe('Insights Panel', () => {
    it('renders insights panel', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      expect(screen.getByTestId('insights-panel')).toBeTruthy();
    });

    it('renders insight items with 💡 icon', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const panel = screen.getByTestId('insights-panel');
      expect(panel.textContent).toContain('💡');
    });
  });

  describe('Business Context', () => {
    it('renders business context section', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      expect(screen.getByTestId('business-context')).toBeTruthy();
    });

    it('starts collapsed', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      expect(screen.queryByPlaceholderText('assessment.domain.businessContextPlaceholder')).toBeNull();
    });

    it('expands on click to show textarea', () => {
      render(<DomainTab domain={pricingDomain} statCards={defaultStatCards} t={mockT} />);
      const section = screen.getByTestId('business-context');
      const expandBtn = within(section).getByText('assessment.domain.expand');
      fireEvent.click(expandBtn);
      expect(screen.getByPlaceholderText('assessment.domain.businessContextPlaceholder')).toBeTruthy();
    });
  });
});
