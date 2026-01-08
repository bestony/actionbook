/**
 * Chunk content builder for playbook-builder
 */

import type { PageCapabilities } from '../types/index.js';

/**
 * Build chunk content from page capabilities
 * This content is stored in chunks.content and used for embedding/search
 * Focuses on capabilities and scenarios - element details are action-builder's job
 */
export function buildChunkContent(pageName: string, capabilities: PageCapabilities): string {
  const parts: string[] = [
    `# ${pageName}`,
    '',
    capabilities.description,
  ];

  // Capabilities as action phrases
  if (capabilities.capabilities.length > 0) {
    parts.push('');
    parts.push('## Capabilities');
    capabilities.capabilities.forEach((cap) => {
      parts.push(`- ${cap}`);
    });
  }

  // Functional areas
  if (capabilities.functionalAreas && capabilities.functionalAreas.length > 0) {
    parts.push('');
    parts.push('## Functional Areas');
    capabilities.functionalAreas.forEach((area) => {
      parts.push(`- ${area}`);
    });
  }

  // User scenarios/workflows
  if (capabilities.scenarios && capabilities.scenarios.length > 0) {
    parts.push('');
    parts.push('## Scenarios');
    capabilities.scenarios.forEach((scenario) => {
      parts.push('');
      parts.push(`### ${scenario.name}`);
      parts.push(`**Goal:** ${scenario.goal}`);
      parts.push('');
      parts.push('**Steps:**');
      scenario.steps.forEach((step, idx) => {
        parts.push(`${idx + 1}. ${step}`);
      });
      parts.push('');
      parts.push(`**Outcome:** ${scenario.outcome}`);
    });
  }

  // Prerequisites
  if (capabilities.prerequisites && capabilities.prerequisites.length > 0) {
    parts.push('');
    parts.push('## Prerequisites');
    capabilities.prerequisites.forEach((prereq) => {
      parts.push(`- ${prereq}`);
    });
  }

  return parts.join('\n');
}
