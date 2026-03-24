/**
 * Unit tests for OverviewBottomSections
 * @vitest-environment happy-dom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import OverviewBottomSections from './OverviewBottomSections';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

function renderComponent() {
  return render(
    <OverviewBottomSections
      orgHealth={assessment.orgHealth}
      completeness={assessment.completeness}
      t={mockT}
    />,
  );
}

describe('OverviewBottomSections', () => {
  afterEach(() => cleanup());

  describe('Prerequisites', () => {
    it('renders prerequisites section', () => {
      renderComponent();
      expect(screen.getByTestId('prerequisites')).toBeTruthy();
    });

    it('shows edition info', () => {
      renderComponent();
      const section = screen.getByTestId('prerequisites');
      expect(section.textContent).toContain('assessment.prerequisites.edition');
    });

    it('shows RCA license warning when not detected', () => {
      renderComponent();
      const section = screen.getByTestId('prerequisites');
      // Mock data has rcaLicenseCount: 0, so should show warning
      expect(section.textContent).toContain('assessment.prerequisites.rcaNotDetected');
    });

    it('shows Salesforce Billing detection', () => {
      renderComponent();
      const section = screen.getByTestId('prerequisites');
      // Mock data has hasSalesforceBilling: true
      expect(section.textContent).toContain('assessment.prerequisites.billingDetected');
    });

    it('renders status icons (✓ and ⚠)', () => {
      renderComponent();
      const section = screen.getByTestId('prerequisites');
      const text = section.textContent || '';
      expect(text).toContain('✓');
      expect(text).toContain('⚠');
    });
  });

  describe('Migration Strategy', () => {
    it('renders migration strategy section', () => {
      renderComponent();
      expect(screen.getByTestId('migration-strategy')).toBeTruthy();
    });

    it('shows phased approach', () => {
      renderComponent();
      const section = screen.getByTestId('migration-strategy');
      expect(section.textContent).toContain('assessment.strategy.phased');
    });

    it('shows 3 phases', () => {
      renderComponent();
      const section = screen.getByTestId('migration-strategy');
      const text = section.textContent || '';
      expect(text).toContain('Core');
      expect(text).toContain('Extensions');
      expect(text).toContain('Integrations');
    });

    it('shows key assumptions', () => {
      renderComponent();
      const section = screen.getByTestId('migration-strategy');
      expect(section.textContent).toContain('assessment.strategy.keyAssumptions');
    });
  });

  describe('Completeness', () => {
    it('renders completeness section', () => {
      renderComponent();
      expect(screen.getByTestId('completeness')).toBeTruthy();
    });

    it('shows progress bar', () => {
      renderComponent();
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeTruthy();
    });

    it('shows correct percentage', () => {
      renderComponent();
      const percent = screen.getByTestId('completeness-percent');
      // 3 completed out of 9 = 33%
      expect(percent.textContent).toBe('33%');
    });

    it('shows both completed and pending items', () => {
      renderComponent();
      const section = screen.getByTestId('completeness');
      const text = section.textContent || '';
      // Completed items have ✓, pending have ○
      expect(text).toContain('✓');
      expect(text).toContain('○');
    });

    it('shows completeness item labels', () => {
      renderComponent();
      const section = screen.getByTestId('completeness');
      expect(section.textContent).toContain('assessment.completeness.orgScanned');
      expect(section.textContent).toContain('assessment.completeness.pdfGenerated');
    });
  });
});
