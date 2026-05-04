import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UtilityBand } from '../UtilityBand';

describe('UtilityBand', () => {
  it('renders the demo environment status with version label', () => {
    const { container } = render(<UtilityBand />);
    expect(container.querySelector('.utility')).not.toBeNull();
    expect(container.querySelector('.utility .dot')).not.toBeNull();
    expect(screen.getByText(/Demo environment · operational/)).toBeInTheDocument();
    expect(screen.getByText('v0.4.2-rc1')).toBeInTheDocument();
  });
});
