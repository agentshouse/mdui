import { expect, test, type Page } from '@playwright/test';
import type { MdRuntime } from '@agentshouse/mdruntime';

type Renderer = HTMLElement & { text: string; resources: unknown[] };

declare global {
  interface Window {
    markdownFixture: {
      runtime: MdRuntime;
      stop: () => void;
      paths: unknown[];
      resources: unknown[];
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createMdRuntime } = await import('@agentshouse/mdruntime');
    const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
    const controller = new AbortController();
    const runtime = createMdRuntime({
      adapter: createMemoryAdapter({
        rooms: [
          {
            name: 'Studio',
            locator: 'studio',
            roomVersion: 'v1',
            writeGrants: [],
            providerOwnedPaths: [],
            documents: {
              'types/note.md': '---\ntype: definition\nsections:\n  Body:\n    kind: text\n---\n',
              'docs/readme.md':
                '---\ntype: note\n---\n## Body\n# Shared note\n\n**Strong** and *gentle*, ~~removed~~ and `code`.\n\n| Topic | State |\n| --- | ---: |\n| Work | Ready |\n\n- [x] Finished\n- [ ] Next\n\n[Continue](next.md)\n',
              'docs/next.md': '# Next\n',
            },
          },
        ],
      }),
      requiredGuarantees: [],
      signal: controller.signal,
    });
    window.markdownFixture = { runtime, stop: () => controller.abort(), paths: [], resources: [] };
    await new Promise<void>((resolve) =>
      runtime.observe('rooms', (rooms) => {
        if (rooms.some((room) => room.roomVersion === 'v1')) resolve();
      }),
    );
  });
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.markdownFixture?.stop());
});

async function render(page: Page, text?: string) {
  await page.evaluate((text) => {
    const element = document.createElement('md-markdown') as Renderer;
    element.setAttribute('room', 'studio');
    element.setAttribute('path', 'docs/readme.md');
    element.setAttribute('label', 'Note');
    element.addEventListener('open-path', (event) =>
      window.markdownFixture.paths.push((event as CustomEvent).detail),
    );
    element.addEventListener('resource-reference', (event) =>
      window.markdownFixture.resources.push((event as CustomEvent).detail),
    );
    element.text =
      text ??
      window.markdownFixture.runtime.query({ selector: { room: 'studio', path: 'docs/readme.md' } })
        .documents[0].sections.Body;
    document.body.append(element);
  }, text);
  return page.locator('md-markdown');
}

test('renders GFM section text returned by the published Runtime', async ({ page }) => {
  const element = await render(page);
  await expect(element.getByRole('article', { name: 'Note' })).toBeVisible();
  await expect(element.getByRole('heading', { level: 1 })).toHaveText('Shared note');
  await expect(element.locator('strong')).toHaveText('Strong');
  await expect(element.locator('em')).toHaveText('gentle');
  await expect(element.locator('del')).toHaveText('removed');
  await expect(element.locator('code')).toHaveText('code');
  await expect(element.getByRole('table')).toContainText('Work');
  await expect(element.getByRole('checkbox').first()).toBeChecked();
  await expect(element.getByRole('checkbox').last()).not.toBeChecked();
  await expect(element.getByRole('link', { name: 'Continue' })).toBeVisible();
});

test('keeps syntax beyond GFM 0.29 literal', async ({ page }) => {
  const element = await render(
    page,
    '~single~ and ~~double~~\n\nA note[^1].\n\n[^1]: Footnote text.\n\n$math$\n\n:::warning\nPlain text\n:::\n',
  );
  await expect(element.locator('del')).toHaveCount(1);
  await expect(element.locator('del')).toHaveText('double');
  await expect(element).toContainText('~single~');
  await expect(element).toContainText('A note[^1].');
  await expect(element).toContainText('[^1]: Footnote text.');
  await expect(element.locator('sup, [data-footnotes]')).toHaveCount(0);
  await expect(element).toContainText('$math$');
  await expect(element).toContainText(':::warning');
});

test('retains only raw disclosures and keeps their Markdown contents operable', async ({
  page,
}) => {
  const element = await render(
    page,
    '<details id="raw" ontoggle="window.rawExecuted=true" style="color:red"><summary title="unsafe" onclick="window.rawExecuted=true">More <b>information</b></summary>\n\n**Nested Markdown** with <em>plain raw text</em>.\n\n<details open><summary>Inner</summary>Inside</details>\n</details>\n\n<p class="raw">Unwrapped</p>\n\n<a href="https://example.com">Raw link</a>\n',
  );
  const summary = element.locator('summary').first();
  await expect(summary).toHaveText('More information');
  await expect(element.locator('details')).toHaveCount(2);
  await expect(element.locator('strong')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(element.locator('strong')).toHaveText('Nested Markdown');
  await expect(element.locator('strong')).toBeVisible();
  await expect(
    element.locator('b, em, a, .raw, #raw, [style], [title], [onclick], [ontoggle]'),
  ).toHaveCount(0);
  await expect(element).toContainText('plain raw text');
  await expect(element).toContainText('Unwrapped');
  await expect(element).toContainText('Raw link');
  expect(await page.evaluate(() => 'rawExecuted' in window)).toBe(false);
});

test('emits resource data without making any rendered network requests', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const element = await render(
    page,
    '![Local diagram](../assets/diagram.svg "Diagram")\n\n![Remote image](https://untrusted.example/image.png)\n\n<img src="https://untrusted.example/raw.png" srcset="https://untrusted.example/double.png 2x" alt="Raw image">\n<video poster="https://untrusted.example/poster.png" src="https://untrusted.example/movie.mp4"><source src="https://untrusted.example/alternate.mp4"></video>\n<object data="https://untrusted.example/file.pdf"></object>\n<link rel="stylesheet" href="https://untrusted.example/style.css">\n',
  );
  await expect(
    element.locator(
      'img, video, audio, source, object, embed, iframe, link, [src], [srcset], [poster]',
    ),
  ).toHaveCount(0);
  await expect(element.getByRole('img', { name: 'Local diagram' })).toBeVisible();
  const references = await page.evaluate(() => ({
    value: (document.querySelector('md-markdown') as Renderer).resources,
    events: window.markdownFixture.resources,
  }));
  expect(references.events).toEqual(
    references.value.map((reference) => ({ room: 'studio', path: 'docs/readme.md', reference })),
  );
  expect(references.value).toEqual(
    expect.arrayContaining([
      {
        kind: 'image',
        destination: '../assets/diagram.svg',
        label: 'Local diagram',
        title: 'Diagram',
      },
      { kind: 'image', destination: 'https://untrusted.example/image.png', label: 'Remote image' },
      { kind: 'image', destination: 'https://untrusted.example/raw.png', label: 'Raw image' },
      { kind: 'resource', destination: 'https://untrusted.example/movie.mp4', label: 'video' },
      { kind: 'resource', destination: 'https://untrusted.example/file.pdf', label: 'object' },
      { kind: 'resource', destination: 'https://untrusted.example/style.css', label: 'link' },
    ]),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(requests).toEqual([]);
  await element.evaluate((node) => {
    (node as Renderer).resources.length = 0;
  });
  expect(await element.evaluate((node) => (node as Renderer).resources.length)).toBeGreaterThan(0);
  await element.evaluate((node) => {
    (node as Renderer).text = 'Replacement text';
  });
  expect(await element.evaluate((node) => (node as Renderer).resources)).toEqual([]);
  await expect(element).toHaveText('Replacement text');
});

test('reports normalized same-Room Paths through keyboard and pointer activation', async ({
  page,
}) => {
  const element = await render(
    page,
    '[Next](next.md#part) · [Parent](../notes/caf%C3%A9.md) · [Here](#heading) · [External](https://example.com/read) · [Email](mailto:hello@example.com)\n\n[Escape](../../outside.md) · [Encoded escape](%2e%2e/%2e%2e/outside.md) · [Unsafe](javascript:alert%281%29)\n',
  );
  const initialUrl = page.url();
  const next = element.getByRole('link', { name: 'Next', exact: true });
  await page.keyboard.press('Tab');
  await expect(next).toBeFocused();
  await page.keyboard.press('Enter');
  await element.getByRole('link', { name: 'Parent', exact: true }).click();
  await element.getByRole('link', { name: 'Here', exact: true }).click();
  expect(await page.evaluate(() => window.markdownFixture.paths)).toEqual([
    { room: 'studio', path: 'docs/next.md', fragment: 'part' },
    { room: 'studio', path: 'notes/café.md' },
    { room: 'studio', path: 'docs/readme.md', fragment: 'heading' },
  ]);
  expect(page.url()).toBe(initialUrl);
  await expect(element.getByRole('link', { name: 'External', exact: true })).toHaveAttribute(
    'href',
    'https://example.com/read',
  );
  await expect(element.getByRole('link', { name: 'Email', exact: true })).toHaveAttribute(
    'href',
    'mailto:hello@example.com',
  );
  await expect(element.getByRole('link', { name: /^(Escape|Encoded escape|Unsafe)$/ })).toHaveCount(
    0,
  );
  await element.evaluate((node) => {
    node.setAttribute('room', 'another-room');
    node.setAttribute('path', 'elsewhere/current.md');
  });
  await element.getByRole('link', { name: 'Next', exact: true }).click();
  expect(await page.evaluate(() => window.markdownFixture.paths.at(-1))).toEqual({
    room: 'another-room',
    path: 'elsewhere/next.md',
    fragment: 'part',
  });
});

test('keeps hostile HTML, URLs, and escaped markup inert through rerendering', async ({ page }) => {
  const requests: string[] = [];
  const dialogs: string[] = [];
  const failures: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on('pageerror', (error) => failures.push(error.message));
  await page.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const element = await render(
    page,
    '<script>window.rawExecuted=true;fetch("https://untrusted.example/script")</script>\n\n<style>@import "https://untrusted.example/style";body{background:url(https://untrusted.example/background)}</style>\n\n<svg onload="window.rawExecuted=true"><image href="https://untrusted.example/svg" /></svg>\n\n<iframe src="https://untrusted.example/frame" srcdoc="<script>parent.rawExecuted=true</script>"></iframe>\n\n<base href="https://untrusted.example/"><meta http-equiv="refresh" content="0;url=https://untrusted.example/refresh">\n\n<form action="https://untrusted.example/submit"><input autofocus onfocus="window.rawExecuted=true"></form>\n\n<details open ontoggle="window.rawExecuted=true"><summary onclick="alert(1)" style="background:url(https://untrusted.example/pixel)">Safe disclosure</summary>Safe text</details>\n\n[Run](java&#x73;cript:alert%281%29) [Data](data:text/html,script) [File](file:///etc/passwd)\n\n![Payload](data:image/svg+xml,%3Csvg%20onload=alert%281%29%3E)\n\n`<img src="https://untrusted.example/code" onerror="alert(1)">`\n\n&lt;script&gt;literal&lt;/script&gt;\n',
  );
  const article = element.getByRole('article');
  await expect(
    article.locator(
      'script, style, svg, math, iframe, base, meta, form, img, [autofocus], [src], [srcset], [style]',
    ),
  ).toHaveCount(0);
  await expect(article.getByRole('link', { name: /^(Run|Data|File)$/ })).toHaveCount(0);
  await expect(article.locator('code')).toContainText('<img src=');
  await expect(article).toContainText('<script>literal</script>');
  const summary = article.locator('summary');
  await summary.click();
  await summary.press('Enter');
  await element.evaluate((node) => {
    const renderer = node as Renderer;
    renderer.text = renderer.text;
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => 'rawExecuted' in window)).toBe(false);
  expect(
    await article.evaluate((node) =>
      [...node.querySelectorAll('*')]
        .flatMap((child) => child.getAttributeNames())
        .filter((name) => name.startsWith('on')),
    ),
  ).toEqual([]);
  expect(requests).toEqual([]);
  expect(dialogs).toEqual([]);
  expect(failures).toEqual([]);
  expect(page.frames()).toHaveLength(1);
});

test('keeps long content and keyboard focus usable at 360px in both themes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addStyleTag({
    content:
      ':root { color-scheme: light dark; background: light-dark(#f5f7fa, #0c1117); } body { margin: 20px; }',
  });
  const element = await render(
    page,
    '# A shared note\n\nA small, readable section with **important text**, a [related note](next.md) and an image reference.\n\n![Planning diagram](../assets/diagram.svg)\n\n<details><summary>More information</summary>\n\nA section with a useful explanation.\n\n</details>\n\n| Topic | State | Owner | Details |\n| --- | --- | --- | --- |\n| Component delivery | Ready | Contributor | A description across narrow columns |\n\n```text\n' +
      'long-code-value-'.repeat(15) +
      '\n```\n\n' +
      'LongUnbrokenText'.repeat(10),
  );
  const link = element.getByRole('link', { name: 'related note' });
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(await element.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
      theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(18, 24, 32)',
    );
    expect(await link.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
    expect(await link.evaluate((node) => getComputedStyle(node).outlineWidth)).toBe('3px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    for (const region of await element.getByRole('region').all()) {
      const box = await region.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    }
    await page.screenshot({
      path: testInfo.outputPath(`markdown-360-${theme}.png`),
      fullPage: true,
    });
  }
  await page.keyboard.press('Tab');
  const summary = element.locator('summary');
  await expect(summary).toBeFocused();
  expect(await summary.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
  await summary.press('Enter');
  await expect(element.getByText('A section with a useful explanation.')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(element.getByRole('region', { name: 'Table' })).toBeFocused();
  await page.keyboard.press('Tab');
  const code = element.getByRole('region', { name: 'Code block' });
  await expect(code).toBeFocused();
  await code.press('ArrowRight');
  await expect.poll(() => code.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await page.evaluate(() => {
    document.body.style.setProperty('--md-color-scheme', 'light');
    document.body.style.setProperty('--md-text', '#152a43');
    document.body.style.setProperty('--md-focus', '#713baf');
  });
  expect(await element.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  expect(await element.evaluate((node) => getComputedStyle(node).color)).toBe('rgb(21, 42, 67)');
  expect(await code.evaluate((node) => getComputedStyle(node).outlineColor)).toBe(
    'rgb(113, 59, 175)',
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  await page.screenshot({ path: testInfo.outputPath('markdown-desktop.png'), fullPage: true });
});

test('renders nested formatting, fences, escaping, autolinks, and reference definitions', async ({
  page,
}) => {
  const element = await render(
    page,
    '> A **bold *nested*** quote.\n> A hard break  \n> follows.\n\n1. Parent\n   - Child\n\n```html\n<details><summary>Literal code</summary></details>\n```\n\n\\*literal\\* &copy; and [Reference][target].\n\n<https://example.com> and www.example.org/test.\n\n[target]: ../notes.md "Related note"\n',
  );
  await expect(element.locator('blockquote strong em')).toHaveText('nested');
  await expect(element.locator('blockquote br')).toHaveCount(1);
  await expect(element.locator('ol > li > ul > li')).toHaveText('Child');
  await expect(element.locator('pre code')).toHaveText(
    '<details><summary>Literal code</summary></details>\n',
  );
  await expect(element.locator('details')).toHaveCount(0);
  await expect(element).toContainText('*literal* ©');
  await expect(
    element.getByRole('link', { name: 'https://example.com', exact: true }),
  ).toHaveAttribute('href', 'https://example.com');
  await expect(
    element.getByRole('link', { name: 'www.example.org/test', exact: true }),
  ).toHaveAttribute('href', 'http://www.example.org/test');
  await element.getByRole('link', { name: 'Reference', exact: true }).click();
  expect(await page.evaluate(() => window.markdownFixture.paths)).toEqual([
    { room: 'studio', path: 'notes.md' },
  ]);
});

test('autolinks FTP text from the pinned GFM 0.29 example 628', async ({ page }) => {
  const element = await render(page, 'Anonymous FTP is available at ftp://foo.bar.baz.\n');
  await expect(
    element.getByRole('link', { name: 'ftp://foo.bar.baz', exact: true }),
  ).toHaveAttribute('href', 'ftp://foo.bar.baz');
});

test('keeps FTP literals within GFM link boundaries without activating resources', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const element = await render(
    page,
    'FTP://files.example/a?x=1&y=2.\n\n(ftp://files.example/search?q=(manual))\n\nftp://files.example/path&copy;\n\nftp://files.example/a"b\n\nftp://files.example/é\n\n`ftp://code.example`\n\n[Read ftp://label.example](next.md)\n\n![ftp://image.example](../assets/diagram.svg)\n\nwordftp://joined.example ftp://missing-dot ftp://bad_name.example\n',
  );
  expect(
    await element
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
  ).toEqual([
    'FTP://files.example/a?x=1&y=2',
    'ftp://files.example/search?q=(manual)',
    'ftp://files.example/path',
    'ftp://files.example/a%22b',
    'ftp://files.example/%C3%A9',
    '#',
  ]);
  await expect(element.locator('code')).toHaveText('ftp://code.example');
  await expect(element.getByRole('link', { name: 'Read ftp://label.example' })).toHaveCount(1);
  await expect(element.locator('a a, img, [src]')).toHaveCount(0);
  await expect(element).toContainText(
    'wordftp://joined.example ftp://missing-dot ftp://bad_name.example',
  );
  await page.keyboard.press('Tab');
  await expect(element.getByRole('link').first()).toBeFocused();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => window.markdownFixture.paths)).toEqual([]);
});

test('preserves literal inline comment text from pinned GFM 0.29 examples 645 and 646', async ({
  page,
}) => {
  const element = await render(
    page,
    'foo <!-- not a comment -- two hyphens -->\n\nfoo <!--> foo -->\n\nfoo <!-- foo--->\n',
  );
  await expect(element).toContainText('foo <!-- not a comment -- two hyphens -->');
  await expect(element).toContainText('foo <!--> foo -->');
  await expect(element).toContainText('foo <!-- foo--->');
});

test('applies the same safe link and inert resource policy to explicit FTP and data destinations', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const element = await render(
    page,
    '[Archive](ftp://files.example/archive) and <ftp://files.example/manual>.\n\n![Data reference](data:image/png;base64,AAAA)\n\n[Script](javascript:alert%281%29) [Data link](data:text/html,hello)\n',
  );
  await expect(element.getByRole('link', { name: 'Archive', exact: true })).toHaveAttribute(
    'href',
    'ftp://files.example/archive',
  );
  await expect(
    element.getByRole('link', { name: 'ftp://files.example/manual', exact: true }),
  ).toHaveAttribute('href', 'ftp://files.example/manual');
  await expect(element.getByRole('link', { name: /^(Script|Data link)$/ })).toHaveCount(0);
  expect(await element.evaluate((node) => (node as Renderer).resources)).toEqual([
    { kind: 'image', label: 'Data reference', destination: 'data:image/png;base64,AAAA' },
  ]);
  await expect(element.locator('img, [src], [srcset]')).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(requests).toEqual([]);
});

test('parses Markdown inside invalid inline comments while valid comments remain inert', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const element = await render(
    page,
    'Text <!-- invalid -- **Visible** ![Diagram](../assets/diagram.svg) -->\n\nText <!-- valid **Hidden** <img src="https://untrusted.example/comment"> -->\n\n<!-- block -- <img src="https://untrusted.example/block"> -->\n',
  );
  await expect(element.locator('strong')).toHaveText('Visible');
  await expect(element).toContainText('Text <!-- invalid -- Visible Diagram -->');
  await expect(element).not.toContainText('Hidden');
  await expect(element.locator('img, [src]')).toHaveCount(0);
  expect(await element.evaluate((node) => (node as Renderer).resources)).toEqual([
    { kind: 'image', label: 'Diagram', destination: '../assets/diagram.svg' },
  ]);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(requests).toEqual([]);
});
