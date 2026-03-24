/**
 * Unit tests for RunDelta components
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RunSelector, DeltaSummary } from './RunDelta';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

describe('RunSelector', () => {
  afterEach(() => cleanup());

  it('renders run selector', () => {
    render(<RunSelector runs={assessment.runs} currentIndex={0} onRunChange={vi.fn()} t={mockT} />);
    expect(screen.getByTestId('run-selector')).toBeTruthy();
  });

  it('shows current run info', () => {
    render(<RunSelector runs={assessment.runs} currentIndex={0} onRunChange={vi.fn()} t={mockT} />);
    const selector = screen.getByTestId('run-selector');
    expect(selector.textContent).toContain('assessment.header.runInfo');
  });

  it('opens dropdown on click', () => {
    render(<RunSelector runs={assessment.runs} currentIndex={0} onRunChange={vi.fn()} t={mockT} />);
    const button = screen.getByLabelText('Select run');
    fireEvent.click(button);
    // Should show all 3 runs
    const runButtons = screen.getAllByText(/Run #/);
    expect(runButtons.length).toBe(3);
  });

  it('calls onRunChange when selecting a different run', () => {
    const onRunChange = vi.fn();
    render(<RunSelector runs={assessment.runs} currentIndex={0} onRunChange={onRunChange} t={mockT} />);
    const button = screen.getByLabelText('Select run');
    fireEvent.click(button);
    const runButtons = screen.getAllByText(/Run #/);
    fireEvent.click(runButtons[1]); // Click second run
    expect(onRunChange).toHaveBeenCalledWith(1);
  });
});

describe('DeltaSummary', () => {
  afterEach(() => cleanup());

  it('renders delta summary', () => {
    render(<DeltaSummary delta={assessment.runDelta} t={mockT} />);
    expect(screen.getByTestId('delta-summary')).toBeTruthy();
  });

  it('shows added/removed/changed counts', () => {
    render(<DeltaSummary delta={assessment.runDelta} t={mockT} />);
    const summary = screen.getByTestId('delta-summary');
    const text = summary.textContent || '';
    expect(text).toContain(`+${assessment.runDelta.added}`);
    expect(text).toContain(`${assessment.runDelta.removed}`);
    expect(text).toContain(`~${assessment.runDelta.changed}`);
  });

  it('renders detail entries', () => {
    render(<DeltaSummary delta={assessment.runDelta} t={mockT} />);
    const summary = screen.getByTestId('delta-summary');
    for (const detail of assessment.runDelta.details) {
      expect(summary.textContent).toContain(detail.text);
    }
  });

  it('shows correct delta type icons', () => {
    render(<DeltaSummary delta={assessment.runDelta} t={mockT} />);
    const summary = screen.getByTestId('delta-summary');
    const text = summary.textContent || '';
    // Should have +, −, ~, = icons
    expect(text).toContain('+');
    expect(text).toContain('−');
  });
});
