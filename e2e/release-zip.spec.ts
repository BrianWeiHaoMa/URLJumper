import fs from 'node:fs';
import path from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { distDir, expect, test } from './extension.ts';

const zipPath = path.resolve(import.meta.dirname, '..', 'release', 'URLJumper.zip');

// Read from the zip's central directory, independently of the writer, so a check of the zip
// never passes on what dist/ or manifest.config.ts say instead.
function readZip(file: string): Map<string, Buffer> {
  const zip = fs.readFileSync(file);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error(`${file} has no end of central directory`);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`entry ${i} has no central header`);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const compressedSize = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const body = zip.subarray(start, start + compressedSize);
    const data = method === 8 ? inflateRawSync(body) : method === 0 ? body : undefined;
    if (!data) throw new Error(`${name} uses compression method ${method}`);
    if (crc32(data) !== crc) throw new Error(`${name} fails its CRC`);
    files.set(name, data);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function filesUnder(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

test('the upload holds exactly the files of dist/, byte for byte, with manifest.json at the root', () => {
  const zipped = readZip(zipPath);
  const built = filesUnder(distDir);
  expect([...zipped.keys()].sort()).toEqual(built.sort());
  expect(zipped.has('manifest.json')).toBe(true);
  for (const name of built) expect(zipped.get(name)?.equals(fs.readFileSync(path.join(distDir, name))), name).toBe(true);
});

test("the upload's manifest declares exactly the released extension's keys and values", () => {
  const manifest = JSON.parse(readZip(zipPath).get('manifest.json')!.toString('utf8'));
  const shortcut = (key: string) => ({ suggested_key: { default: key, mac: key }, description: expect.stringMatching(/\S/) });

  expect(Object.keys(manifest).sort()).toEqual(
    [
      'action',
      'background',
      'commands',
      'content_security_policy',
      'description',
      'icons',
      'manifest_version',
      'minimum_chrome_version',
      'name',
      'omnibox',
      'options_ui',
      'permissions',
      'version',
    ].sort(),
  );
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.name).toBe('URLJumper');
  expect(manifest.version).toBe('2.3.0');
  expect(manifest.minimum_chrome_version).toBe('127');
  expect([...manifest.permissions].sort()).toEqual(['activeTab', 'clipboardWrite', 'contextMenus', 'search', 'storage']);
  expect(manifest.permissions).toHaveLength(5);
  for (const key of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'incognito']) {
    expect(manifest).not.toHaveProperty(key);
  }
  expect(manifest.commands).toEqual({
    'open-new-tab': shortcut('Alt+N'),
    'open-same-tab': shortcut('Alt+M'),
    'name-this-page': shortcut('Alt+Shift+N'),
  });
  expect(manifest.omnibox).toEqual({ keyword: 'uj' });
  expect(manifest.content_security_policy).toEqual({ extension_pages: "default-src 'self'" });
  expect(manifest.background).toEqual({ service_worker: expect.stringMatching(/\.js$/), type: 'module' });
  expect(manifest.action).toEqual({ default_popup: 'popup.html', default_title: 'URLJumper' });
  expect(manifest.options_ui).toEqual({ page: 'options.html', open_in_tab: true });
  // F1: the product is URLJumper in every string; 1.x wrote "URL Jumper".
  expect(JSON.stringify(manifest)).not.toMatch(/URL\s+Jumper/i);
});

// R6 is kept by what the upload holds, not only by src/: a bundler may add code of its own, as Vite's
// module-preload polyfill does with `fetch`.
test('no script in the upload calls fetch, XMLHttpRequest, or WebSocket', () => {
  const calls = [...readZip(zipPath)]
    .filter(([name]) => name.endsWith('.js'))
    .flatMap(([name, data]) => [...data.toString('utf8').matchAll(/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/g)].map((call) => `${name}: ${call[0]}`));
  expect(calls).toEqual([]);
});
