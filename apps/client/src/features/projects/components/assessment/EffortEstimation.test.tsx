/**
 * Unit tests for EffortEstimation
 * @vitest-environment happy-dom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EffortEstimation from './EffortEstimation';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

function renderComponent() {
  return render(<EffortEstimation assessment={assessment} t={mockT} />);
}

describe('EffortEstimation', () => {
  afterEach(() => cleanup());

  it('renders effort estimation table', () => {
    renderComponent();
    expect(screen.getByTestId('effort-estimation')).toBeTruthy();
  });

  it('renders all 9 domain rows plus subtotal, testing, PM, training, grand total', () => {
    renderComponent();
    const rows = screen.getAllByRole('row');
    // 1 header + 9 domains + 1 subtotal + 3 additional + 1 grand total = 15
    expect(rows).toHaveLength(15);
  });

  it('shows correct item counts for domains', () => {
    renderComponent();
    const table = screen.getByTestId('effort-estimation');
    const text = table.textContent || '';
    // Products has 187 items
    expect(text).toContain('187');
    // Pricing has 243 items
    expect(text).toContain('243');
  });

  it('shows auto/guided/manual breakdowns', () => {
    renderComponent();
    const table = screen.getByTestId('effort-estimation');
    const text = table.textContent || '';
    // Pricing: auto=82, guided=100, manual=58
    expect(text).toContain('82');
    expect(text).toContain('100');
  });

  it('hours input accepts numeric input', () => {
    renderComponent();
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // First input is first domain's hours
    fireEvent.change(inputs[0], { target: { value: '40' } });
    expect(inputs[0].value).toBe('40');
  });

  it('subtotal auto-sums domain hours', () => {
    renderComponent();
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Enter hours for first two domains
    fireEvent.change(inputs[0], { target: { value: '40' } });
    fireEvent.change(inputs[1], { target: { value: '60' } });
    const subtotal = screen.getByTestId('subtotal-hours');
    expect(subtotal.textContent).toBe('100');
  });

  it('grand total sums domain + additional hours', () => {
    renderComponent();
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Domain hours
    fireEvent.change(inputs[0], { target: { value: '100' } });
    // Testing hours (10th input - after 9 domains)
    const testingInput = screen.getByLabelText('Testing hours') as HTMLInputElement;
    fireEvent.change(testingInput, { target: { value: '20' } });
    // PM hours
    const pmInput = screen.getByLabelText('PM hours') as HTMLInputElement;
    fireEvent.change(pmInput, { target: { value: '10' } });

    const grandTotal = screen.getByTestId('grand-total');
    expect(grandTotal.textContent).toBe('130');
  });

  it('additional rows are editable', () => {
    renderComponent();
    const testingInput = screen.getByLabelText('Testing hours') as HTMLInputElement;
    const pmInput = screen.getByLabelText('PM hours') as HTMLInputElement;
    const trainingInput = screen.getByLabelText('Training hours') as HTMLInputElement;

    fireEvent.change(testingInput, { target: { value: '50' } });
    fireEvent.change(pmInput, { target: { value: '30' } });
    fireEvent.change(trainingInput, { target: { value: '20' } });

    expect(testingInput.value).toBe('50');
    expect(pmInput.value).toBe('30');
    expect(trainingInput.value).toBe('20');
  });

  it('shows dash when no hours entered', () => {
    renderComponent();
    const subtotal = screen.getByTestId('subtotal-hours');
    expect(subtotal.textContent).toBe('—');
    const grandTotal = screen.getByTestId('grand-total');
    expect(grandTotal.textContent).toBe('—');
  });
});
