import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never { throw new Error('boom'); }

it('replaces a crashed tree with a reload prompt instead of a blank page', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(<ErrorBoundary><Broken /></ErrorBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('AeroGrid 3D could not be displayed');
  expect(screen.getByRole('button', { name: /Reload/ })).toBeInTheDocument();
  log.mockRestore();
});
