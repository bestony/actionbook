/**
 * Mock factories for playbook-builder tests
 */

import { vi } from 'vitest';

/**
 * Create a mock AIClient
 */
export function createMockAIClient() {
  return {
    chat: vi.fn(),
    getProvider: vi.fn().mockReturnValue('openai'),
    getModel: vi.fn().mockReturnValue('gpt-4o'),
  };
}

/**
 * Helper to create LLM response with tool calls (OpenAI format)
 */
export function createToolCallResponse(toolCalls: Array<{ name: string; args: Record<string, unknown> }>) {
  return {
    choices: [{
      message: {
        content: null,
        tool_calls: toolCalls.map((tc, i) => ({
          id: `call_${i}`,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          },
        })),
      },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

/**
 * Helper to create LLM response without tool calls (completion)
 */
export function createCompletionResponse(content: string) {
  return {
    choices: [{
      message: {
        content,
        tool_calls: undefined,
      },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}
