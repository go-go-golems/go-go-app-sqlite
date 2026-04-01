import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('sqlite host contract source', () => {
  it('does not re-register launcher-private sqlite state as a shared reducer', () => {
    const hostSource = readFileSync(new URL('./host.ts', import.meta.url), 'utf8');

    expect(hostSource).not.toContain('sharedReducers:');
    expect(hostSource).not.toContain('app_sqlite:');
  });
});
