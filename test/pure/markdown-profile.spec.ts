import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { micromark } from 'micromark';
import { commonmarkProfile, markdownProfile } from '../../src/components/profile.js';

const examples: { number: number; extension: string; markdown: string; html: string }[] =
  JSON.parse(readFileSync('test/fixtures/gfm-0.29.json', 'utf8'));

function normalizeCheckboxAttributes(html: string): string {
  return html.replace(
    /<input\s+([^>]+)>/g,
    (_tag, attributes: string) =>
      '<input ' +
      [...attributes.matchAll(/([a-z]+)="([^"]*)"/g)]
        .map((match) => `${match[1]}="${match[2]}"`)
        .sort()
        .join(' ') +
      '>',
  );
}

test.each(examples)('GFM 0.29 example $number', ({ extension, markdown, html }) => {
  const configuration = extension ? markdownProfile : commonmarkProfile;
  expect(
    normalizeCheckboxAttributes(
      micromark(markdown, {
        ...configuration,
        allowDangerousHtml: true,
        allowDangerousProtocol: true,
      }),
    ),
  ).toBe(normalizeCheckboxAttributes(html));
});
