/**
 * Unit tests for DomainTabWrapper
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DomainTabWrapper from './DomainTabWrapper';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';
import type { DomainId } from '../../mocks/assessment-mock-data';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

function renderDomain(domainId: DomainId) {
  return render(
    <MemoryRouter>
      <DomainTabWrapper domainId={domainId} assessment={assessment} t={mockT} />
    </MemoryRouter>
  );
}

describe('DomainTabWrapper', () => {
  afterEach(() => cleanup());

  const domainIds: DomainId[] = [
    'products',
    'pricing',
    'rules',
    'code',
    'integrations',
    'amendments',
    'approvals',
    'documents',
    'dataReporting',
  ];

  it.each(domainIds)('renders %s domain without errors', (domainId) => {
    renderDomain(domainId);
    expect(screen.getByTestId('stats-strip')).toBeTruthy();
    expect(screen.getByTestId('migration-status-bar')).toBeTruthy();
    expect(screen.getByTestId('inventory-table')).toBeTruthy();
  });

  it('products tab has 4 sub-tabs', () => {
    renderDomain('products');
    const sidebar = screen.getByTestId('sub-tab-sidebar');
    expect(sidebar).toBeTruthy();
  });

  it('pricing tab has 3 sub-tabs', () => {
    renderDomain('pricing');
    const sidebar = screen.getByTestId('sub-tab-sidebar');
    expect(sidebar).toBeTruthy();
  });

  it('rules tab has no sub-tabs', () => {
    renderDomain('rules');
    expect(screen.queryByTestId('sub-tab-sidebar')).toBeNull();
  });

  it('approvals tab has no sub-tabs', () => {
    renderDomain('approvals');
    expect(screen.queryByTestId('sub-tab-sidebar')).toBeNull();
  });

  it('documents tab has no sub-tabs', () => {
    renderDomain('documents');
    expect(screen.queryByTestId('sub-tab-sidebar')).toBeNull();
  });

  it('code tab shows LOC count in stats', () => {
    renderDomain('code');
    const strip = screen.getByTestId('stats-strip');
    expect(strip.textContent).toContain('4,200+');
  });

  it('dataReporting tab shows report/dashboard counts', () => {
    renderDomain('dataReporting');
    const strip = screen.getByTestId('stats-strip');
    expect(strip.textContent).toContain('Reports');
    expect(strip.textContent).toContain('Dashboards');
  });

  it('integrations tab shows package count', () => {
    renderDomain('integrations');
    const strip = screen.getByTestId('stats-strip');
    expect(strip.textContent).toContain('assessment.subTabs.packageDependencies');
  });

  it('amendments tab shows MDQ count', () => {
    renderDomain('amendments');
    const strip = screen.getByTestId('stats-strip');
    expect(strip.textContent).toContain('MDQ');
  });
});
