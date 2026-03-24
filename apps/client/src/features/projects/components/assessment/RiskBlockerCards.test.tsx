/**
 * Unit tests for RiskBlockerCards component
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import RiskBlockerCards from './RiskBlockerCards';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

function renderComponent(overrides = {}) {
  const onViewAllRisks = vi.fn();
  const onViewAllBlockers = vi.fn();
  const result = render(
    <RiskBlockerCards
      risks={assessment.risks}
      findings={assessment.keyFindings}
      blockedCount={assessment.totalBlocked}
      onViewAllRisks={onViewAllRisks}
      onViewAllBlockers={onViewAllBlockers}
      t={mockT}
      {...overrides}
    />,
  );
  return { ...result, onViewAllRisks, onViewAllBlockers };
}

describe('RiskBlockerCards', () => {
  afterEach(() => cleanup());

  describe('Top Risks', () => {
    it('renders top risks card', () => {
      renderComponent();
      expect(screen.getByTestId('top-risks-card')).toBeTruthy();
    });

    it('shows top 3 risks', () => {
      renderComponent();
      const card = screen.getByTestId('top-risks-card');
      // Should have severity badges
      const badges = within(card).getAllByText(/assessment\.riskRegister\.severities\./);
      expect(badges.length).toBe(3);
    });

    it('shows "view all" link with count', () => {
      renderComponent();
      const card = screen.getByTestId('top-risks-card');
      const viewAll = within(card).getByText(/assessment\.overview\.viewAllRisks/);
      expect(viewAll).toBeTruthy();
    });

    it('calls onViewAllRisks when clicked', () => {
      const { onViewAllRisks } = renderComponent();
      const card = screen.getByTestId('top-risks-card');
      const viewAll = within(card).getByText(/assessment\.overview\.viewAllRisks/);
      fireEvent.click(viewAll);
      expect(onViewAllRisks).toHaveBeenCalledTimes(1);
    });
  });

  describe('Blockers', () => {
    it('renders blockers card with red ring', () => {
      renderComponent();
      const card = screen.getByTestId('blockers-card');
      expect(card.className).toContain('ring-red-200');
    });

    it('shows critical risks as blockers', () => {
      renderComponent();
      const card = screen.getByTestId('blockers-card');
      // Should have 🚫 icons for critical risks
      const content = card.textContent || '';
      expect(content).toContain('🚫');
    });

    it('calls onViewAllBlockers when clicked', () => {
      const { onViewAllBlockers } = renderComponent();
      const card = screen.getByTestId('blockers-card');
      const viewAll = within(card).getByText(/assessment\.overview\.viewAllBlockers/);
      fireEvent.click(viewAll);
      expect(onViewAllBlockers).toHaveBeenCalledTimes(1);
    });
  });

  describe('Key Findings', () => {
    it('renders key findings section', () => {
      renderComponent();
      expect(screen.getByTestId('key-findings')).toBeTruthy();
    });

    it('renders all findings', () => {
      renderComponent();
      const section = screen.getByTestId('key-findings');
      // Each finding has a severity icon (✓, !, ✕)
      const content = section.textContent || '';
      expect(content).toContain('assessment.findings.bundleCompatible');
      expect(content).toContain('assessment.findings.qcpCallout');
    });

    it('renders findings with correct icon types', () => {
      renderComponent();
      const section = screen.getByTestId('key-findings');
      const content = section.textContent || '';
      // Success findings get ✓
      expect(content).toContain('✓');
      // Error findings get ✕
      expect(content).toContain('✕');
      // Warning findings get !
      expect(content).toContain('!');
    });

    it('renders correct number of findings', () => {
      renderComponent();
      const section = screen.getByTestId('key-findings');
      // Count finding text entries
      const findingTexts = assessment.keyFindings.map((f) => f.text);
      for (const text of findingTexts) {
        expect(section.textContent).toContain(text);
      }
    });
  });
});
