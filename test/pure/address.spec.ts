import { expect, test } from 'vitest';
import { parseAddress, splitAddress } from '../../src/address.js';

test.each([
  ['//notes', { path: '//notes', search: '', hash: '' }],
  ['http:notes', { path: 'http:notes', search: '', hash: '' }],
  ['/\\notes', { path: '/\\notes', search: '', hash: '' }],
  ['https://notes', { path: 'https://notes', search: '', hash: '' }],
  ['//file/studio/notes/hello.md', { path: '//file/studio/notes/hello.md', search: '', hash: '' }],
  ['/?keep=1', { path: '/', search: '?keep=1', hash: '' }],
  ['/#Body', { path: '/', search: '', hash: '#Body' }],
  ['?keep=1', { path: '', search: '?keep=1', hash: '' }],
  ['#Body', { path: '', search: '', hash: '#Body' }],
  [
    '/file/studio/notes/hello.md?keep=1#Body',
    { path: '/file/studio/notes/hello.md', search: '?keep=1', hash: '#Body' },
  ],
  ['/file/x#h?q=1', { path: '/file/x', search: '', hash: '#h?q=1' }],
])('splitAddress keeps %j as a path', (address, split) => {
  expect(splitAddress(address)).toEqual(split);
});

test.each([
  '//notes',
  'http:notes',
  '/\\notes',
  'https://notes',
  '//file/studio/notes/hello.md',
  '/http:notes',
  '/https://notes',
  '/file:studio/notes/hello.md',
  '/notes',
  '/file/studio/notes/hello%2.md',
])('parseAddress treats %j as an unroutable remainder', (address) => {
  expect(parseAddress(address)).toMatchObject({
    screen: null,
    room: null,
    path: null,
    remainder: true,
  });
});

test.each(['', '/', '/?keep=1', '/#Body', '?keep=1', '#Body'])(
  'parseAddress treats %j as the absence of an address',
  (address) => {
    expect(parseAddress(address)).toMatchObject({ screen: null, remainder: false });
  },
);

test('parseAddress opens a File remainder', () => {
  expect(parseAddress('/file/studio/notes/hello.md?keep=1#Body')).toEqual({
    screen: 'file',
    room: 'studio',
    path: 'notes/hello.md',
    search: '?keep=1',
    hash: '#Body',
    remainder: true,
  });
});

test('parseAddress opens a screen remainder', () => {
  expect(parseAddress('/search')).toEqual({
    screen: 'search',
    room: null,
    path: null,
    search: '',
    hash: '',
    remainder: true,
  });
});

test('parseAddress decodes File segments', () => {
  expect(parseAddress('/file/studio/notes/hello%20world.md')).toEqual({
    screen: 'file',
    room: 'studio',
    path: 'notes/hello world.md',
    search: '',
    hash: '',
    remainder: true,
  });
  expect(parseAddress('/file/studio/notes/hash%23name.md')).toEqual({
    screen: 'file',
    room: 'studio',
    path: 'notes/hash#name.md',
    search: '',
    hash: '',
    remainder: true,
  });
});
