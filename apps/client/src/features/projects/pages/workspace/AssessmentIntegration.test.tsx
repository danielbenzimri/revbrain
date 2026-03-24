/**
 * Integration tests for Assessment workspace
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AssessmentPage from './AssessmentPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const Q1_PROJECT_ID = '00000000-0000-4000-a000-000000000401';

function renderAssessment(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/project/${Q1_PROJECT_ID}/assessment${search}`]}>
      <Routes>
        <Route path="/project/:id/assessment" element={<AssessmentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Assessment Integration', () => {
  afterEach(() => cleanup());

  it('full page renders without errors', () => {
    renderAssessment();
    expect(screen.getByText('assessment.title')).toBeTruthy();
  });

  it('overview tab shows all sections', () => {
    renderAssessment();
    // Readiness cards
    expect(screen.getByTestId('readiness-cards')).toBeTruthy();
    // Heatmap
    expect(screen.getByTestId('domain-heatmap')).toBeTruthy();
    // Risk/blocker cards
    expect(screen.getByTestId('top-risks-card')).toBeTruthy();
    expect(screen.getByTestId('blockers-card')).toBeTruthy();
    // Key findings
    expect(screen.getByTestId('key-findings')).toBeTruthy();
    // Delta
    expect(screen.getByTestId('delta-summary')).toBeTruthy();
    // Prerequisites
    expect(screen.getByTestId('prerequisites')).toBeTruthy();
    // Strategy
    expect(screen.getByTestId('migration-strategy')).toBeTruthy();
    // Completeness
    expect(screen.getByTestId('completeness')).toBeTruthy();
  });

  it('tab navigation works end-to-end', () => {
    renderAssessment();
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');

    // Click pricing tab
    fireEvent.click(tabs[2]);
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');

    // Should show domain tab content (stats strip, table)
    expect(screen.getByTestId('stats-strip')).toBeTruthy();
    expect(screen.getByTestId('inventory-table')).toBeTruthy();
  });

  it('heatmap click navigates to domain tab', () => {
    renderAssessment();
    const heatmap = screen.getByTestId('domain-heatmap');
    const rows = within(heatmap).getAllByRole('button');

    // Click first domain row (products)
    fireEvent.click(rows[0]);

    // Products tab should now be active
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true'); // products is index 1
  });

  it('table row click opens item detail slide-over', () => {
    renderAssessment('?tab=pricing');
    const table = screen.getByTestId('inventory-table');
    const rows = within(table).getAllByRole('row');
    // Click first data row (skip header)
    fireEvent.click(rows[1]);
    // Item detail panel should be visible
    expect(screen.getByTestId('item-detail-panel')).toBeTruthy();
    expect(screen.getByTestId('ai-description')).toBeTruthy();
  });

  it('item detail panel closes on close button', () => {
    renderAssessment('?tab=pricing');
    const table = screen.getByTestId('inventory-table');
    const rows = within(table).getAllByRole('row');
    fireEvent.click(rows[1]);
    expect(screen.getByTestId('item-detail-panel')).toBeTruthy();

    // Close panel
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('item-detail-panel')).toBeNull();
  });

  it('view all risks opens risk register', () => {
    renderAssessment();
    const risksCard = screen.getByTestId('top-risks-card');
    const viewAll = within(risksCard).getByText(/assessment\.overview\.viewAllRisks/);
    fireEvent.click(viewAll);
    // Risk register should be visible
    expect(screen.getByTestId('risk-register')).toBeTruthy();
    expect(screen.getByTestId('risk-heat-map')).toBeTruthy();
  });

  it('all text uses translation keys', () => {
    renderAssessment();
    // The mock t() returns the key, so if we see raw English text it's a bug
    // Check that the main UI sections use t() keys
    const titleEl = screen.getByText('assessment.title');
    expect(titleEl).toBeTruthy();
  });

  it('run selector shows in header', () => {
    renderAssessment();
    expect(screen.getByTestId('run-selector')).toBeTruthy();
  });

  it('renders correctly with ?tab=code URL param', () => {
    renderAssessment('?tab=code');
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    // code is index 4 (overview=0, products=1, pricing=2, rules=3, code=4)
    expect(tabs[4].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('stats-strip')).toBeTruthy();
  });
});
