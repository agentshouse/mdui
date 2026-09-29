import { expect, test, type Page } from '@playwright/test';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import type { FieldControl } from '../../src/components/fields.js';

declare global {
  interface Window {
    fieldsFixture: {
      runtime: MdRuntimeClient;
      stop: () => void;
      changes: unknown[];
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
    const helper = '/src/testing.js';
    const { fixtureRoom, openTestRuntime, waitForRooms } = await import(helper);
    const person = '---\ntype: definition\nfields:\n  name:\n    kind: string\n---\n';
    const adapter = createMemoryAdapter({
      rooms: [
        fixtureRoom({
          name: 'Studio',
          locator: 'studio',
          roomVersion: 'v1',
          writeGrants: [],
          providerOwnedPaths: [],
          documents: {
            'types/person.md': person,
            'types/project.md':
              '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\n  amount:\n    kind: number\n  due:\n    kind: date\n  stage:\n    kind: enum\n    values: [Draft, Ready]\n  owner:\n    kind: reference\n    to: person\n  tags:\n    kind: list\n    of: string\n  amounts:\n    kind: list\n    of: number\n  dates:\n    kind: list\n    of: date\n  stages:\n    kind: list\n    of: enum\n    values: [Draft, Ready]\n  owners:\n    kind: list\n    of: reference\n    to: person\n---\n',
            'people/ada.md': '---\ntype: person\nname: Ada\n---\n',
            'people/lin.md': '---\ntype: person\nname: Lin\n---\n',
            'notes.md': '# An untyped Document\n',
          },
        }),
        fixtureRoom({
          name: 'Other',
          locator: 'other',
          roomVersion: 'v2',
          writeGrants: [],
          providerOwnedPaths: [],
          documents: {
            'types/person.md': person,
            'people/outsider.md': '---\ntype: person\nname: Outsider\n---\n',
          },
        }),
      ],
    });
    const opened = await openTestRuntime(adapter, { requiredGuarantees: [] });
    window.fieldsFixture = { runtime: opened.runtime, stop: opened.stop, changes: [] };
    await waitForRooms(
      opened.runtime,
      (rooms: readonly { roomVersion: string | null }[]) =>
        rooms.length === 2 && rooms.every((room) => room.roomVersion !== null),
    );
  });
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.fieldsFixture?.stop());
});

async function mount(page: Page, kind: string, field: string, label: string, value?: unknown) {
  await page.evaluate(
    async ({ kind, field, label, value }) => {
      const element = document.createElement(`md-${kind}-field`) as FieldControl;
      element.setAttribute('label', label);
      await element.bind(window.fieldsFixture.runtime, 'studio', 'project', field);
      if (value !== undefined) element.value = value;
      element.addEventListener('change', (event) => {
        window.fieldsFixture.changes.push((event as CustomEvent).detail);
      });
      document.body.append(element);
    },
    { kind, field, label, value },
  );
}

test('edits a labelled string with keyboard focus and a value change', async ({ page }) => {
  await mount(page, 'string', 'title', 'Title');
  const input = page.getByRole('textbox', { name: 'Title', exact: true });
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  expect(await input.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  expect(
    await page
      .locator('md-string-field')
      .evaluate((element) => (element as FieldControl).validity.valid),
  ).toBe(false);
  await input.fill('A small project');
  await input.press('Tab');
  expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([
    {
      value: 'A small project',
      validity: { valid: true, message: '' },
    },
  ]);
  expect(
    await page.locator('md-string-field').evaluate((element) => (element as FieldControl).value),
  ).toBe('A small project');
  await input.fill('');
  await input.press('Tab');
  expect(
    await page
      .locator('md-string-field')
      .evaluate((element) => (element as FieldControl).validity.valid),
  ).toBe(true);
  await input.fill('First line\nSecond line');
  await input.press('Tab');
  expect(
    await page.locator('md-string-field').evaluate((element) => (element as FieldControl).value),
  ).toBe('First line\nSecond line');
});

test('edits decimal numbers and reports incomplete numeric input', async ({ page }) => {
  await mount(page, 'number', 'amount', 'Amount', 12.5);
  const input = page.getByRole('spinbutton', { name: 'Amount', exact: true });
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await input.fill('1250.75');
  await input.press('Tab');
  expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([
    {
      value: 1250.75,
      validity: { valid: true, message: '' },
    },
  ]);
  await expect(page.locator('md-number-field')).toContainText('1,250.75');
  await page.locator('md-number-field').evaluate((element) => {
    (element as FieldControl).value = 1e-21;
  });
  await expect(page.locator('md-number-field')).toContainText('0.000000000000000000001');
  await input.fill('');
  await input.press('e');
  expect(
    await page
      .locator('md-number-field')
      .evaluate((element) => (element as FieldControl).validity.valid),
  ).toBe(false);
  await expect(page.getByText('Enter a number.', { exact: true })).toBeVisible();
});

test('picks dates with a locale display and rejects an impossible supplied date', async ({
  page,
}) => {
  await mount(page, 'date', 'due', 'Due');
  const input = page.getByLabel('Due', { exact: true });
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await input.fill('2026-09-09');
  await input.press('Tab');
  expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([
    {
      value: '2026-09-09',
      validity: { valid: true, message: '' },
    },
  ]);
  await expect(page.locator('md-date-field')).toContainText('Sep 9, 2026');
  await input.focus();
  await input.press('ArrowUp');
  await input.press('Tab');
  expect(
    await page.locator('md-date-field').evaluate((element) => (element as FieldControl).value),
  ).not.toBe('2026-09-09');
  await page.locator('md-date-field').evaluate((element) => {
    (element as FieldControl).value = '2026-02-30';
  });
  await expect(page.getByText('Choose a valid date.', { exact: true })).toBeVisible();
  expect(
    await page
      .locator('md-date-field')
      .evaluate((element) => (element as FieldControl).validity.valid),
  ).toBe(false);
});

test('selects only declared enum values from the keyboard', async ({ page }) => {
  await mount(page, 'enum', 'stage', 'Stage');
  const input = page.getByRole('combobox', { name: 'Stage', exact: true });
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await input.press('ArrowDown');
  await input.press('Tab');
  expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([
    {
      value: 'Draft',
      validity: { valid: true, message: '' },
    },
  ]);
  expect(await input.locator('option').allTextContents()).toEqual([
    'Choose a value',
    'Draft',
    'Ready',
  ]);
  await page.locator('md-enum-field').evaluate((element) => {
    (element as FieldControl).value = 'Missing';
  });
  await expect(input).toHaveValue('Missing');
  await expect(page.getByText('Choose an available value.', { exact: true })).toBeVisible();
  expect(
    await page
      .locator('md-enum-field')
      .evaluate((element) => (element as FieldControl).validity.valid),
  ).toBe(false);
});

test('selects same-Room references of the required type while offline', async ({ page }) => {
  await page.context().setOffline(true);
  await mount(page, 'reference', 'owner', 'Owner');
  const input = page.getByRole('combobox', { name: 'Owner', exact: true });
  expect(
    await input
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
  ).toEqual(['', 'people/ada.md', 'people/lin.md']);
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await input.press('ArrowDown');
  await input.press('Tab');
  expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([
    {
      value: 'people/ada.md',
      validity: { valid: true, message: '' },
    },
  ]);
  await page.locator('md-reference-field').evaluate((element) => {
    (element as FieldControl).value = 'people/outsider.md';
  });
  await expect(input).toHaveValue('people/outsider.md');
  expect(
    await page
      .locator('md-reference-field')
      .evaluate((element) => (element as FieldControl).validity.valid),
  ).toBe(false);
  await expect(page.getByText('Choose an available value.', { exact: true })).toBeVisible();
});

test('edits a list as one value and retains keyboard focus when adding and removing', async ({
  page,
}) => {
  await mount(page, 'list', 'tags', 'Tags', ['one']);
  await page.keyboard.press('Tab');
  const first = page.getByRole('textbox', { name: 'Tags 1', exact: true });
  await expect(first).toBeFocused();
  await first.fill('changed');
  await first.press('Tab');
  expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([
    {
      value: ['changed'],
      validity: { valid: true, message: '' },
    },
  ]);
  const add = page.getByRole('button', { name: 'Add item', exact: true });
  await add.focus();
  await add.press('Enter');
  const second = page.getByRole('textbox', { name: 'Tags 2', exact: true });
  await expect(second).toBeFocused();
  await second.fill('second');
  await second.press('Tab');
  await page.getByRole('button', { name: 'Remove item 2', exact: true }).press('Enter');
  await expect(add).toBeFocused();
  expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([
    { value: ['changed'], validity: { valid: true, message: '' } },
    { value: ['changed', ''], validity: { valid: true, message: '' } },
    { value: ['changed', 'second'], validity: { valid: true, message: '' } },
    { value: ['changed'], validity: { valid: true, message: '' } },
  ]);
  expect(
    await page.locator('md-list-field').evaluate((element) => {
      const list = element as FieldControl;
      (list.value as string[]).push('outside');
      return list.value;
    }),
  ).toEqual(['changed']);
});

for (const example of [
  {
    field: 'amounts',
    label: 'Amounts',
    initial: 1.5,
    next: '2.75',
    expected: 2.75,
    invalid: 'text',
    select: false,
  },
  {
    field: 'dates',
    label: 'Dates',
    initial: '2026-09-09',
    next: '2026-09-10',
    expected: '2026-09-10',
    invalid: '2026-02-30',
    select: false,
  },
  {
    field: 'stages',
    label: 'Stages',
    initial: 'Draft',
    next: 'Ready',
    expected: 'Ready',
    invalid: 'Missing',
    select: true,
  },
  {
    field: 'owners',
    label: 'Owners',
    initial: 'people/ada.md',
    next: 'people/lin.md',
    expected: 'people/lin.md',
    invalid: 'people/outsider.md',
    select: true,
  },
]) {
  test(`edits ${example.field} through one typed list value`, async ({ page }) => {
    await mount(page, 'list', example.field, example.label, [example.initial]);
    const input = page.getByLabel(`${example.label} 1`, { exact: true });
    if (example.select) await input.selectOption(example.next);
    else await input.fill(example.next);
    await input.press('Tab');
    expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([
      {
        value: [example.expected],
        validity: { valid: true, message: '' },
      },
    ]);
    await page.locator('md-list-field').evaluate((element, invalid) => {
      (element as FieldControl).value = [invalid];
    }, example.invalid);
    expect(
      await page
        .locator('md-list-field')
        .evaluate((element) => (element as FieldControl).validity.valid),
    ).toBe(false);
  });
}

test('follows browser themes and App CSS overrides at 360 pixels', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addStyleTag({
    content:
      ':root { color-scheme: light dark; background: light-dark(#f5f7fa, #0c1117); } body { margin: 20px; } body > * { margin-bottom: 20px; }',
  });
  for (const [kind, field, label, value] of [
    ['string', 'title', 'Title', 'A small project'],
    ['number', 'amount', 'Amount', 1250.75],
    ['date', 'due', 'Due', '2026-09-09'],
    ['enum', 'stage', 'Stage', 'Ready'],
    ['reference', 'owner', 'Owner', 'people/ada.md'],
    ['list', 'tags', 'Tags', ['Planning', 'Delivery']],
  ] as const)
    await mount(page, kind, field, label, value);
  const input = page.getByRole('textbox', { name: 'Title', exact: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await input.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(input).toBeFocused();
    expect(await input.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(29, 35, 43)',
    );
    expect(
      await page
        .locator('md-string-field')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(18, 24, 32)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    for (const control of await page.locator('input, textarea, select, button').all()) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
      await control.focus();
      expect(await control.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
        'solid',
      );
    }
    await input.focus();
    await page.screenshot({ path: testInfo.outputPath(`fields-360-${theme}.png`), fullPage: true });
  }
  await page.evaluate(() => document.body.style.setProperty('--md-color-scheme', 'light'));
  expect(await input.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  await page.evaluate(() => {
    document.body.style.setProperty('--md-surface', '#eef2ff');
    document.body.style.setProperty('--md-text', '#152a43');
    document.body.style.setProperty('--md-focus', '#713baf');
  });
  expect(await input.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgb(238, 242, 255)',
  );
  expect(await input.evaluate((element) => getComputedStyle(element).color)).toBe(
    'rgb(21, 42, 67)',
  );
  expect(await input.evaluate((element) => getComputedStyle(element).outlineColor)).toBe(
    'rgb(113, 59, 175)',
  );
});

test.describe('French browser locale', () => {
  test.use({ locale: 'fr-FR', timezoneId: 'Pacific/Honolulu' });
  test('formats dates and numbers in the browser locale while keeping labels English', async ({
    page,
  }) => {
    await mount(page, 'number', 'amount', 'Amount', 1250.75);
    await mount(page, 'date', 'due', 'Due', '2026-09-09');
    await expect(page.getByRole('spinbutton', { name: 'Amount', exact: true })).toHaveAttribute(
      'lang',
      'fr-FR',
    );
    await expect(page.locator('md-number-field')).toContainText('1\u202f250,75');
    await expect(page.locator('md-date-field')).toContainText('9 sept. 2026');
    await expect(page.getByLabel('Due', { exact: true })).toHaveValue('2026-09-09');
    expect(
      await page.locator('md-date-field').evaluate((element) => (element as FieldControl).value),
    ).toBe('2026-09-09');
    await page.locator('md-number-field').evaluate((element) => {
      (element as FieldControl).value = 'wrong';
    });
    await expect(page.getByText('Enter a number.', { exact: true })).toBeVisible();
  });
});

test.describe('Browser locale that is not a valid language tag', () => {
  test.use({ locale: 'en-US@posix', timezoneId: 'UTC' });
  test('formats dates and numbers in the runtime default locale without a page error', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mount(page, 'number', 'amount', 'Amount', 1250.75);
    await mount(page, 'date', 'due', 'Due', '2026-09-09');
    await expect(page.getByRole('spinbutton', { name: 'Amount', exact: true })).toHaveAttribute(
      'lang',
      'en-US-u-va-posix',
    );
    await expect(page.locator('md-number-field')).toContainText('1250.75');
    await expect(page.locator('md-date-field')).toContainText('Sep 9, 2026');
    expect(errors).toEqual([]);
  });
});

test('disables all scalar and list interactions through the public attribute', async ({ page }) => {
  for (const [kind, field, label, value] of [
    ['string', 'title', 'Title', 'text'],
    ['number', 'amount', 'Amount', 1],
    ['date', 'due', 'Due', '2026-09-09'],
    ['enum', 'stage', 'Stage', 'Draft'],
    ['reference', 'owner', 'Owner', 'people/ada.md'],
    ['list', 'owners', 'Owners', ['people/ada.md']],
  ] as const)
    await mount(page, kind, field, label, value);
  await page.evaluate(() => {
    for (const element of document.body.children) element.setAttribute('disabled', '');
  });
  for (const input of await page.locator('input, textarea, select, button').all())
    await expect(input).toBeDisabled();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(await page.evaluate(() => window.fieldsFixture.changes)).toEqual([]);
});
