// Zips dist/ into release/URLJumper.zip, the Chrome Web Store upload. Written with node:zlib alone
// so `npm run package` works on any platform with Node, without a system `zip` or a package.
import fs from 'node:fs';
import path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(root, 'release');
const zipPath = path.join(releaseDir, 'URLJumper.zip');

// Every entry carries 1980-01-01 00:00, the earliest DOS time, so identical builds zip identically.
const dosTime = 0;
const dosDate = (1 << 5) | 1;
const utf8Names = 0x0800;
const madeByUnix = (3 << 8) | 20;
const regularFileMode = 0o100644 << 16;
const zip32Limit = 0xffffffff;

interface Entry {
  name: string;
  data: Buffer;
}

// Entry names are paths inside dist/ with `/` separators, as the zip format requires on every OS.
function listFiles(dir: string, prefix = ''): Entry[] {
  const entries: Entry[] = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = prefix + item.name;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) entries.push(...listFiles(full, name + '/'));
    else if (item.isFile()) entries.push({ name, data: fs.readFileSync(full) });
    else throw new Error(`dist/${name} is neither a file nor a directory`);
  }
  return entries;
}

function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    if (data.length > zip32Limit || offset > zip32Limit) throw new Error(`dist/${name} needs ZIP64, which this writer does not write`);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(utf8Names, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(madeByUnix, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(utf8Names, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(regularFileMode >>> 0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  if (entries.length > 0xffff || offset > zip32Limit) throw new Error('dist/ needs ZIP64, which this writer does not write');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
  throw new Error('dist/manifest.json is missing: run `npm run build` first');
}
const entries = listFiles(distDir).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
fs.mkdirSync(releaseDir, { recursive: true });
// Written beside the zip and renamed over it, so a failure never leaves a partial upload.
const partialPath = zipPath + '.partial';
fs.writeFileSync(partialPath, zip(entries));
fs.renameSync(partialPath, zipPath);
console.log(`${path.relative(root, zipPath)}: ${entries.length} files from dist/`);
