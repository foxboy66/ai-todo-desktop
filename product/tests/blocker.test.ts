import { describe, expect, it } from 'vitest';
import { shouldShowBlockerPrompt } from '../src/renderer/blocker';

describe('blocker prompt visibility', () => {
  it('does not open automatically on the execute view', () => {
    expect(shouldShowBlockerPrompt('execute', false)).toBe(false);
  });

  it('opens only after the user clicks the blocker action', () => {
    expect(shouldShowBlockerPrompt('execute', true)).toBe(true);
    expect(shouldShowBlockerPrompt('review', true)).toBe(false);
  });

  it('switches away from the initial prompt after a reason is selected', () => {
    expect(shouldShowBlockerPrompt('execute', true, '临时事项打断')).toBe(false);
  });
});