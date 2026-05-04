import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Icons, type IconName } from '../Icons';

describe('Icons', () => {
  const names = Object.keys(Icons) as IconName[];

  it('exports a non-empty icon set', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each(names)('renders <%s /> as an svg', (name) => {
    const Icon = Icons[name];
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('applies the size prop to width/height attributes', () => {
    const Icon = Icons.home;
    const { container } = render(<Icon size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
  });

  it('applies the className prop to the root svg', () => {
    const Icon = Icons.home;
    const { container } = render(<Icon className="my-icon" />);
    expect(container.querySelector('svg.my-icon')).not.toBeNull();
  });

  it('marks svgs as decorative via aria-hidden', () => {
    const Icon = Icons.home;
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
