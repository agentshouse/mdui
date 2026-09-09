import { transformFile } from '@swc/core';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { dependencies } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const imports = {};
const input = {};
for (const name of Object.keys(dependencies)) {
  const manifestPath = fileURLToPath(import.meta.resolve(`${name}/package.json`));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const entry of Object.keys(manifest.exports)) {
    if (entry === './package.json') continue;
    const specifier = name + entry.slice(1);
    const entryName = `package-${Object.keys(input).length}`;
    input[entryName] = fileURLToPath(import.meta.resolve(specifier));
    imports[specifier] = `/dependencies/${entryName}.js`;
  }
}
const bundle = await rolldown({ input, platform: 'browser' });
let output;
try {
  ({ output } = await bundle.generate({ format: 'esm', entryFileNames: '[name].js' }));
} finally {
  await bundle.close();
}
const modules = new Map(output.map((chunk) => [`/dependencies/${chunk.fileName}`, chunk.code]));
const importMap = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.ts', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:4173');
    const pathname = url.pathname === '/' ? '/src/index.html' : decodeURIComponent(url.pathname);
    if (modules.has(pathname)) {
      response.writeHead(200, { 'content-type': types.get('.js') }).end(modules.get(pathname));
      return;
    }
    let path = resolve(root, `.${pathname}`);
    const name = relative(root, path);
    if (!name.startsWith('src/')) {
      response.writeHead(404).end();
      return;
    }
    if (name.startsWith('src/') && extname(path) === '.js') path = path.slice(0, -3) + '.ts';
    let body = extname(path) === '.ts' ? (await transformFile(path)).code : await readFile(path);
    if (name === 'src/index.html') body = body.toString().replace('<head>', `<head>\n${importMap}`);
    response.writeHead(200, {
      'content-type': types.get(extname(path)) ?? 'application/octet-stream',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
  }
});

server.listen(4173, '127.0.0.1', () => {
  process.stdout.write('host: http://127.0.0.1:4173\n');
});
