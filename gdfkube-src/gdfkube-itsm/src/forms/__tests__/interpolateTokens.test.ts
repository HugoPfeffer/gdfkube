import { describe, expect, it } from 'vitest';
import { interpolateTokens } from '../interpolateTokens';

describe('interpolateTokens', () => {
  it('replaces {key} with provided value', () => {
    expect(interpolateTokens('hello {name}', { name: 'world' })).toBe('hello world');
  });

  it('keeps the literal {key} when key is missing', () => {
    expect(interpolateTokens('hi {missing}', { name: 'world' })).toBe('hi {missing}');
  });

  it('replaces multiple tokens in the same string', () => {
    expect(
      interpolateTokens('{greeting}, {name}! env={env}', {
        greeting: 'Hello',
        name: 'Alice',
        env: 'prod',
      }),
    ).toBe('Hello, Alice! env=prod');
  });

  it('coerces numeric values to strings', () => {
    expect(interpolateTokens('count={n}', { n: 42 })).toBe('count=42');
  });

  it('returns the input unchanged when there are no tokens', () => {
    expect(interpolateTokens('plain text', { x: '1' })).toBe('plain text');
  });

  it('does not recurse — does not interpolate tokens that come from substituted values', () => {
    expect(interpolateTokens('{a}', { a: '{b}', b: 'should-not-appear' })).toBe('{b}');
  });
});
