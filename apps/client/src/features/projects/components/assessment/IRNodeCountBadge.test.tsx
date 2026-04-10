/**
 * PH8.5 — Unit tests for IRNodeCountBadge.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import IRNodeCountBadge from './IRNodeCountBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string; count?: number }) => {
      const base = opts?.defaultValue ?? '';
      return opts?.count !== undefined ? base.replace('{{count}}', String(opts.count)) : base;
    },
    i18n: { language: 'en' },
  }),
}));

describe('IRNodeCountBadge', () => {
  afterEach(() => cleanup());

  it('renders a node count when provided', () => {
    render(<IRNodeCountBadge irNodeCount={42} />);
    const badge = screen.getByTestId('ir-node-count-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('42');
    expect(badge.getAttribute('data-ir-node-count')).toBe('42');
  });

  it('renders a pending placeholder when irNodeCount is null', () => {
    render(<IRNodeCountBadge irNodeCount={null} />);
    const badge = screen.getByTestId('ir-node-count-badge');
    expect(badge.textContent).toContain('pending');
    expect(badge.getAttribute('data-ir-node-count')).toBe('');
  });

  it('renders a pending placeholder when irNodeCount is undefined', () => {
    render(<IRNodeCountBadge irNodeCount={undefined} />);
    expect(screen.getByTestId('ir-node-count-badge')).toBeTruthy();
  });

  it('handles zero as a valid count (not pending)', () => {
    render(<IRNodeCountBadge irNodeCount={0} />);
    const badge = screen.getByTestId('ir-node-count-badge');
    expect(badge.getAttribute('data-ir-node-count')).toBe('0');
    expect(badge.textContent).toContain('0');
  });
});
