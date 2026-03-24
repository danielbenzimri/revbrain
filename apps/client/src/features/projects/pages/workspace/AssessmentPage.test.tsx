/**
 * Unit tests for Assessment Page shell
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AssessmentPage from './AssessmentPage';

// Mock i18n — returns the key itself so we can assert on translation keys
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const Q1_PROJECT_ID = '00000000-0000-4000-a000-000000000401';
const EMPTY_PROJECT_ID = '00000000-0000-4000-a000-000000000404';

function renderWithRouter(projectId: string, search = '') {
  return render(
    <MemoryRouter initialEntries={[`/project/${projectId}/assessment${search}`]}>
      <Routes>
        <Route path="/project/:id/assessment" element={<AssessmentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AssessmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('empty state', () => {
    it('renders empty state when no assessment data', () => {
      renderWithRouter(EMPTY_PROJECT_ID);
      expect(screen.getByText('workspace.placeholder.assessment.heading')).toBeTruthy();
      expect(screen.getByText('workspace.placeholder.assessment.description')).toBeTruthy();
    });

    it('renders CTA button in empty state', () => {
      renderWithRouter(EMPTY_PROJECT_ID);
      expect(screen.getAllByText('workspace.placeholder.assessment.cta').length).toBeGreaterThan(0);
    });

    it('does not render tabs in empty state', () => {
      renderWithRouter(EMPTY_PROJECT_ID);
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
    });
  });

  describe('assessment workspace', () => {
    it('renders page title', () => {
      renderWithRouter(Q1_PROJECT_ID);
      expect(screen.getByText('assessment.title')).toBeTruthy();
    });

    it('renders export button', () => {
      renderWithRouter(Q1_PROJECT_ID);
      // Button contains export text as a child text node
      const buttons = screen.getAllByRole('button');
      const exportBtn = buttons.find((b) => b.textContent?.includes('assessment.header.export'));
      expect(exportBtn).toBeTruthy();
    });

    it('renders all 10 tabs', () => {
      renderWithRouter(Q1_PROJECT_ID);
      const tablist = screen.getByRole('tablist');
      const tabs = within(tablist).getAllByRole('tab');
      expect(tabs).toHaveLength(10);
    });

    it('renders tab names for all domains', () => {
      renderWithRouter(Q1_PROJECT_ID);
      const tablist = screen.getByRole('tablist');
      const tabs = within(tablist).getAllByRole('tab');
      const tabTexts = tabs.map((t) => t.textContent?.trim());

      expect(tabTexts).toContain('assessment.tabs.overview');
      expect(tabTexts).toContain('assessment.tabs.products');
      expect(tabTexts).toContain('assessment.tabs.pricing');
      expect(tabTexts).toContain('assessment.tabs.rules');
      expect(tabTexts).toContain('assessment.tabs.code');
      expect(tabTexts).toContain('assessment.tabs.integrations');
      expect(tabTexts).toContain('assessment.tabs.amendments');
      expect(tabTexts).toContain('assessment.tabs.approvals');
      expect(tabTexts).toContain('assessment.tabs.documents');
      expect(tabTexts).toContain('assessment.tabs.dataReporting');
    });

    it('defaults to overview tab (first tab selected)', () => {
      renderWithRouter(Q1_PROJECT_ID);
      const tablist = screen.getByRole('tablist');
      const tabs = within(tablist).getAllByRole('tab');
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    });

    it('shows red dot on tabs with blocked items', () => {
      renderWithRouter(Q1_PROJECT_ID);
      const blockerDots = screen.getAllByLabelText('has blockers');
      expect(blockerDots.length).toBeGreaterThan(0);
    });

    it('clicking a tab switches active tab', () => {
      renderWithRouter(Q1_PROJECT_ID);
      const tablist = screen.getByRole('tablist');
      const tabs = within(tablist).getAllByRole('tab');
      fireEvent.click(tabs[1]);
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
      expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    });

    it('renders tab content panel', () => {
      renderWithRouter(Q1_PROJECT_ID);
      const panels = screen.getAllByRole('tabpanel');
      expect(panels.length).toBe(1);
    });

    it('respects tab from URL search params', () => {
      renderWithRouter(Q1_PROJECT_ID, '?tab=pricing');
      const tablist = screen.getByRole('tablist');
      const tabs = within(tablist).getAllByRole('tab');
      // pricing is index 2 (overview=0, products=1, pricing=2)
      expect(tabs[2].getAttribute('aria-selected')).toBe('true');
      expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    });
  });
});
