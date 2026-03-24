/**
 * Unit tests for ExecutiveSummary
 * @vitest-environment happy-dom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ExecutiveSummary from './ExecutiveSummary';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

describe('ExecutiveSummary', () => {
  afterEach(() => cleanup());

  it('renders executive summary section', () => {
    render(<ExecutiveSummary assessment={assessment} t={mockT} />);
    expect(screen.getByTestId('executive-summary')).toBeTruthy();
  });

  it('shows narrative with item count', () => {
    render(<ExecutiveSummary assessment={assessment} t={mockT} />);
    const narrative = screen.getByTestId('executive-narrative');
    expect(narrative.textContent).toContain('configuration items');
    expect(narrative.textContent).toContain('9 domains');
  });

  it('shows auto/guided/manual percentages', () => {
    render(<ExecutiveSummary assessment={assessment} t={mockT} />);
    const narrative = screen.getByTestId('executive-narrative');
    expect(narrative.textContent).toMatch(/\d+%.*auto-migrated/);
    expect(narrative.textContent).toMatch(/\d+%.*guided setup/);
    expect(narrative.textContent).toMatch(/\d+%.*custom development/);
  });

  it('shows critical blockers count', () => {
    render(<ExecutiveSummary assessment={assessment} t={mockT} />);
    const narrative = screen.getByTestId('executive-narrative');
    expect(narrative.textContent).toContain('critical blocker');
  });

  it('shows RCA license warning when not detected', () => {
    render(<ExecutiveSummary assessment={assessment} t={mockT} />);
    const summary = screen.getByTestId('executive-summary');
    expect(summary.textContent).toContain('RCA licenses are not detected');
  });

  it('shows key metrics strip with 4 cards', () => {
    render(<ExecutiveSummary assessment={assessment} t={mockT} />);
    const metrics = screen.getByTestId('executive-metrics');
    expect(metrics.textContent).toContain('Total Items');
    expect(metrics.textContent).toContain('Domains Scanned');
    expect(metrics.textContent).toContain('Critical Blockers');
    expect(metrics.textContent).toContain('RCA License Status');
  });

  it('shows readiness badge', () => {
    render(<ExecutiveSummary assessment={assessment} t={mockT} />);
    const summary = screen.getByTestId('executive-summary');
    expect(summary.textContent).toContain('Migration Readiness');
  });

  it('has dark gradient background for premium feel', () => {
    render(<ExecutiveSummary assessment={assessment} t={mockT} />);
    const section = screen.getByTestId('executive-summary');
    expect(section.className).toContain('bg-linear-to-br');
  });
});
