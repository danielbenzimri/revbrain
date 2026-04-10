/**
 * Unit tests for RiskRegister
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RiskRegister from './RiskRegister';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

function renderComponent(onClose = vi.fn()) {
  return {
    onClose,
    ...render(<RiskRegister risks={assessment.risks} onClose={onClose} t={mockT} />),
  };
}

describe('RiskRegister', () => {
  afterEach(() => cleanup());

  it('renders risk register', () => {
    renderComponent();
    expect(screen.getByTestId('risk-register')).toBeTruthy();
  });

  it('renders all 23 risks', () => {
    renderComponent();
    const rows = screen.getAllByRole('row');
    // 1 header + 23 data rows
    expect(rows).toHaveLength(24);
  });

  it('renders risk heat map', () => {
    renderComponent();
    expect(screen.getByTestId('risk-heat-map')).toBeTruthy();
  });

  it('category filter reduces visible risks', () => {
    renderComponent();
    const allRows = screen.getAllByRole('row');
    const categoryFilter = screen.getByLabelText('assessment.riskRegister.category');
    fireEvent.change(categoryFilter, { target: { value: 'technical' } });
    const filtered = screen.getAllByRole('row');
    expect(filtered.length).toBeLessThan(allRows.length);
    expect(filtered.length).toBeGreaterThan(1); // header + at least 1
  });

  it('severity filter works', () => {
    renderComponent();
    const allRows = screen.getAllByRole('row');
    const severityFilter = screen.getByLabelText('assessment.riskRegister.severity');
    fireEvent.change(severityFilter, { target: { value: 'critical' } });
    const filtered = screen.getAllByRole('row');
    expect(filtered.length).toBeLessThan(allRows.length);
  });

  it('search filters by description text', () => {
    renderComponent();
    const searchInput = screen.getByLabelText('assessment.table.search');
    fireEvent.change(searchInput, { target: { value: 'Calculator' } });
    const rows = screen.getAllByRole('row');
    // Should find the Calculator plugins risk + header
    expect(rows.length).toBe(2);
  });

  it('shows "no results" when nothing matches', () => {
    renderComponent();
    const searchInput = screen.getByLabelText('assessment.table.search');
    fireEvent.change(searchInput, { target: { value: 'zzzzzznonexistent' } });
    expect(screen.getByText('assessment.table.noResults')).toBeTruthy();
  });

  it('severity badges use correct colors', () => {
    renderComponent();
    // Critical risks should have red badge (span elements, not option elements)
    const criticalBadges = screen
      .getAllByText('assessment.riskRegister.severities.critical')
      .filter((el) => el.tagName === 'SPAN');
    expect(criticalBadges.length).toBeGreaterThan(0);
    for (const badge of criticalBadges) {
      expect(badge.className).toContain('bg-red-50');
    }
  });

  it('shows mitigation text for each risk', () => {
    renderComponent();
    const register = screen.getByTestId('risk-register');
    // All risks have mitigation text
    expect(register.textContent).toContain('Dedicated Phase 2');
  });

  it('shows unassigned for risks without owner', () => {
    renderComponent();
    const unassigned = screen.getAllByText('assessment.riskRegister.unassigned');
    expect(unassigned.length).toBeGreaterThan(0);
  });
});
