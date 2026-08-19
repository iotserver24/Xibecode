import { describe, expect, it } from 'vitest';
import {
  evaluateDeferredToolPlan,
  looksLikeDeferredToolPlan,
} from './deferred-tool-plan.js';

describe('looksLikeDeferredToolPlan', () => {
  it('catches the I-understand-then-stop browser plan', () => {
    const text =
      'I understand! You\'d like me to do some web research about recent AI innovations and use `agent-browser` to browse the web. ' +
      'Let\'s check the workspace first. I will start by searching using web_search and opening a browser session with agent-browser.';
    expect(looksLikeDeferredToolPlan(text)).toBe(true);
  });

  it('catches I-will-run-a-search without a tool call', () => {
    expect(
      looksLikeDeferredToolPlan(
        'I understand! Let\'s start by searching the web. I will run a search query first.',
      ),
    ).toBe(true);
  });

  it('catches I-will-inspect-the-project', () => {
    expect(
      looksLikeDeferredToolPlan(
        'I understand you sent "h8". Let\'s take a look at the current project. I\'ll inspect the directory and git status first.',
      ),
    ).toBe(true);
  });

  it('allows a real answer that merely mentions a tool', () => {
    expect(
      looksLikeDeferredToolPlan(
        'Use `web_search` when you need current docs. The helper lives in src/tools.ts.',
      ),
    ).toBe(false);
  });

  it('allows a greeting with no promised work', () => {
    expect(
      looksLikeDeferredToolPlan(
        'Hello! How can I help you today? Let me know what you\'d like to work on.',
      ),
    ).toBe(false);
  });
});

describe('evaluateDeferredToolPlan', () => {
  it('nudges once then respects the retry budget', () => {
    const text = 'I will use web_search and agent-browser to research this.';
    const first = evaluateDeferredToolPlan({ assistantText: text, retries: 0 });
    expect(first.nudge).toBe(true);
    expect(first.message).toMatch(/zero tool calls/i);

    const done = evaluateDeferredToolPlan({ assistantText: text, retries: 2 });
    expect(done.nudge).toBe(false);
  });
});
