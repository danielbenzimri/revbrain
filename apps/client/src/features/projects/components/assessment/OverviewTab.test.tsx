/**
 * Unit tests for OverviewTab component
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import OverviewTab from './OverviewTab';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';
import type { DomainId } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

function renderOverview(onDomainClick = vi.fn()) {
  return {
    onDomainClick,
    ...render(
      <OverviewTab assessment={assessment} onDomainClick={onDomainClick} t={mockT} />,
    ),
  };
}

describe('OverviewTab', () => {
  afterEach(() => cleanup());

  describe('Migration Readiness', () => {
    it('renders 4 stat cards', () => {
      renderOverview();
      const cards = screen.getByTestId('readiness-cards');
      // Should have auto, guided, manual, blocked
      expect(within(cards).getByText('assessment.migrationStatus.auto')).toBeTruthy();
      expect(within(cards).getByText('assessment.migrationStatus.guided')).toBeTruthy();
      expect(within(cards).getByText('assessment.migrationStatus.manual')).toBeTruthy();
      expect(within(cards).getByText('assessment.migrationStatus.blocked')).toBeTruthy();
    });

    it('renders correct counts from mock data', () => {
      renderOverview();
      const cards = screen.getByTestId('readiness-cards');
      expect(within(cards).getByText(String(assessment.totalAuto))).toBeTruthy();
      expect(within(cards).getByText(String(assessment.totalGuided))).toBeTruthy();
      expect(within(cards).getByText(String(assessment.totalManual))).toBeTruthy();
      expect(within(cards).getByText(String(assessment.totalBlocked))).toBeTruthy();
    });

    it('renders stacked bar with segments', () => {
      renderOverview();
      // Stacked bar segments have aria-labels
      const autoBar = screen.getByLabelText(/assessment\.migrationStatus\.auto/);
      expect(autoBar).toBeTruthy();
    });

    it('blocked card has red visual treatment when count > 0', () => {
      renderOverview();
      const cards = screen.getByTestId('readiness-cards');
      // Find the blocked card container
      const blockedLabel = within(cards).getByText('assessment.migrationStatus.blocked');
      const blockedCard = blockedLabel.closest('[class*="bg-red-50"]');
      expect(blockedCard).toBeTruthy();
    });
  });

  describe('Complexity Heatmap', () => {
    it('renders 9 domain rows', () => {
      renderOverview();
      const heatmap = screen.getByTestId('domain-heatmap');
      const rows = within(heatmap).getAllByRole('button');
      expect(rows).toHaveLength(9);
    });

    it('renders domain names', () => {
      renderOverview();
      const heatmap = screen.getByTestId('domain-heatmap');
      expect(within(heatmap).getByText('assessment.tabs.products')).toBeTruthy();
      expect(within(heatmap).getByText('assessment.tabs.pricing')).toBeTruthy();
      expect(within(heatmap).getByText('assessment.tabs.dataReporting')).toBeTruthy();
    });

    it('renders complexity labels', () => {
      renderOverview();
      const heatmap = screen.getByTestId('domain-heatmap');
      // Should have mix of low, moderate, high
      const allText = heatmap.textContent || '';
      expect(allText).toContain('assessment.complexity.high');
      expect(allText).toContain('assessment.complexity.moderate');
      expect(allText).toContain('assessment.complexity.low');
    });

    it('shows warning on domains with blocked items', () => {
      renderOverview();
      const blockerWarnings = screen.getAllByLabelText('has blockers');
      expect(blockerWarnings.length).toBeGreaterThan(0);
    });

    it('clicking a domain row calls onDomainClick', () => {
      const { onDomainClick } = renderOverview();
      const heatmap = screen.getByTestId('domain-heatmap');
      const rows = within(heatmap).getAllByRole('button');
      // Click the first row (products)
      fireEvent.click(rows[0]);
      expect(onDomainClick).toHaveBeenCalledWith('products' as DomainId);
    });

    it('clicking pricing row passes correct domain id', () => {
      const { onDomainClick } = renderOverview();
      const heatmap = screen.getByTestId('domain-heatmap');
      const rows = within(heatmap).getAllByRole('button');
      // Click the second row (pricing)
      fireEvent.click(rows[1]);
      expect(onDomainClick).toHaveBeenCalledWith('pricing' as DomainId);
    });

    it('renders item counts per domain', () => {
      renderOverview();
      const heatmap = screen.getByTestId('domain-heatmap');
      const text = heatmap.textContent || '';
      // Products has 187 items
      expect(text).toContain('187');
      // Pricing has 243 items
      expect(text).toContain('243');
    });
  });
});
