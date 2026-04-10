/**
 * Unit tests for ItemDetailPanel
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ItemDetailPanel from './ItemDetailPanel';
import { getMockAssessmentData } from '../../mocks/assessment-mock-data';

const Q1_ID = '00000000-0000-4000-a000-000000000401';
const assessment = getMockAssessmentData(Q1_ID)!;
const mockT = (key: string) => key;

// Use the first pricing item (Enterprise Volume Discount)
const testItem = assessment.domains.find((d) => d.id === 'pricing')!.items[0];

function renderPanel(item = testItem, onClose = vi.fn()) {
  return { onClose, ...render(<ItemDetailPanel item={item} onClose={onClose} t={mockT} />) };
}

describe('ItemDetailPanel', () => {
  afterEach(() => cleanup());

  it('renders nothing when item is null', () => {
    render(<ItemDetailPanel item={null} onClose={vi.fn()} t={mockT} />);
    expect(screen.queryByTestId('item-detail-panel')).toBeNull();
  });

  it('renders panel when item is provided', () => {
    renderPanel();
    expect(screen.getByTestId('item-detail-panel')).toBeTruthy();
  });

  it('shows item name', () => {
    renderPanel();
    expect(screen.getByTestId('item-name').textContent).toBe(testItem.name);
  });

  it('shows API name', () => {
    renderPanel();
    expect(screen.getByTestId('item-detail-panel').textContent).toContain(testItem.apiName);
  });

  it('shows status block with complexity and migration status', () => {
    renderPanel();
    const block = screen.getByTestId('status-block');
    expect(block.textContent).toContain('assessment.complexity.' + testItem.complexity);
    expect(block.textContent).toContain('assessment.migrationStatus.' + testItem.migrationStatus);
  });

  it('shows AI description with sparkle', () => {
    renderPanel();
    const section = screen.getByTestId('ai-description');
    expect(section.textContent).toContain(testItem.aiDescription);
    expect(section.textContent).toContain('assessment.itemDetail.aiDescription');
  });

  it('shows edit and verify buttons', () => {
    renderPanel();
    const section = screen.getByTestId('ai-description');
    expect(section.textContent).toContain('assessment.itemDetail.edit');
    expect(section.textContent).toContain('assessment.itemDetail.verify');
  });

  it('shows CPQ→RCA mapping', () => {
    renderPanel();
    const section = screen.getByTestId('cpq-rca-mapping');
    expect(section.textContent).toContain(testItem.apiName);
    expect(section.textContent).toContain(testItem.rcaTarget!);
  });

  it('shows dependencies list', () => {
    renderPanel();
    const section = screen.getByTestId('dependencies');
    for (const dep of testItem.dependencies) {
      expect(section.textContent).toContain(dep);
    }
  });

  it('shows recommendation', () => {
    renderPanel();
    const section = screen.getByTestId('recommendation');
    expect(section.textContent).toContain(testItem.whyStatus);
  });

  it('shows consultant notes textarea', () => {
    renderPanel();
    expect(screen.getByTestId('consultant-notes')).toBeTruthy();
    expect(screen.getByPlaceholderText('assessment.itemDetail.addNote')).toBeTruthy();
  });

  it('notes textarea is editable', () => {
    renderPanel();
    const textarea = screen.getByPlaceholderText(
      'assessment.itemDetail.addNote'
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test note' } });
    expect(textarea.value).toBe('Test note');
  });

  it('close button calls onClose', () => {
    const { onClose } = renderPanel();
    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('overlay click calls onClose', () => {
    const { onClose } = renderPanel();
    // The overlay is the backdrop div
    const overlay = screen.getByTestId('item-detail-panel').querySelector('[aria-hidden]');
    if (overlay) fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
