#!/usr/bin/env node
// Builds RapidVis: the viewer (a desktop app that stands on its own) and the Blender add-on, which
// ships with that viewer inside it. Every version comes from version.json. Needs Node 22.2+.
//
//   node scripts/build.mjs [all]          version, viewer, then the add-on, for this computer
//   node scripts/build.mjs viewer         just the viewer's installer (and the copy the add-on carries)
//   node scripts/build.mjs addon          just the add-on, from the last viewer build
//   node scripts/build.mjs version        writes version.json's version everywhere it's needed
//   node scripts/build.mjs version --check [--tag v1.2.3]   fails if anything disagrees (for CI)
//
// Options: --platform windows-x64 | linux-x64 | macos-arm64 | macos-x64 (default: this computer's)
//          --blender <path to Blender>   also validates the add-on with Blender (or set BLENDER)
//
// Everything lands in dist/: the installer and the add-on zip. dist/work/ holds what's in between.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const VIEWER = path.join(ROOT, 'viewer');
const ADDON = path.join(ROOT, 'blender', 'rapidvis_addon');
const DIST = path.join(ROOT, 'dist');
const WORK = path.join(DIST, 'work');

/** The platforms we build for, by Blender's names for them. */
const PLATFORMS = {
  'windows-x64': { host: 'win32', builder: ['--win', '--x64'], unpacked: 'win-unpacked' },
  'linux-x64': { host: 'linux', builder: ['--linux', '--x64'], unpacked: 'linux-unpacked' },
  'macos-arm64': { host: 'darwin', builder: ['--mac', '--arm64'], unpacked: 'mac-arm64' },
  'macos-x64': { host: 'darwin', builder: ['--mac', '--x64'], unpacked: 'mac' },
};
const INSTALLERS = ['.exe', '.dmg', '.AppImage'];
const COMMANDS = ['all', 'viewer', 'addon', 'version'];

// --- Versions ---

function readVersion() {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
    throw new Error(`version.json: "${version}" isn't a version like 1.2.3 (or 1.2.3-beta.1)`);
  }
  return version;
}

/** Every file that carries the version, and how to set it there. */
const VERSIONED = [
  {
    file: path.join(VIEWER, 'package.json'),
    set: (text, version) => json(text, (data) => (data.version = version)),
  },
  {
    file: path.join(VIEWER, 'package-lock.json'),
    set: (text, version) =>
      json(text, (data) => {
        data.version = version;
        data.packages[''].version = version;
      }),
  },
  {
    file: path.join(ADDON, 'blender_manifest.toml'),
    set: (text, version) => text.replace(/^version = ".*"$/m, `version = "${version}"`),
  },
];

function json(text, change) {
  const data = JSON.parse(text);
  change(data);
  return JSON.stringify(data, null, 2) + '\n';
}

/** Writes the version into every file that needs it (or, with `check`, fails if any differ). */
function syncVersion(version, { check = false, tag } = {}) {
  if (tag && tag !== `v${version}`) {
    throw new Error(`The tag ${tag} doesn't match version.json (${version}): tag it v${version}`);
  }
  const stale = [];
  for (const { file, set } of VERSIONED) {
    const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const updated = set(text, version);
    if (updated === text) continue;
    stale.push(path.relative(ROOT, file));
    if (!check) fs.writeFileSync(file, updated);
  }
  if (check && stale.length > 0) {
    throw new Error(
      `These don't match version.json (${version}): ${stale.join(', ')}. Run: node scripts/build.mjs version`,
    );
  }
  console.log(
    stale.length > 0 ? `Version ${version} written to ${stale.join(', ')}` : `Version ${version} everywhere`,
  );
}

// --- The viewer ---

function run(command, args, cwd = ROOT) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32' && (command === 'npm' || command === 'npx'), // npm.cmd
  });
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status ?? result.signal})`);
}

/** The viewer's installer in dist/, and the whole app, packed, in dist/work/ for the add-on. */
function buildViewer(version, platform) {
  const { builder, unpacked } = PLATFORMS[platform];
  if (!fs.existsSync(path.join(VIEWER, 'node_modules'))) run('npm', ['ci'], VIEWER);
  const release = path.join(VIEWER, 'release');
  fs.rmSync(release, { recursive: true, force: true }); // so nothing from an older build gets picked up

  run('npm', ['run', 'build'], VIEWER);
  run('npm', ['run', 'build:electron'], VIEWER);
  run('npx', ['electron-builder', ...builder, '--publish', 'never'], VIEWER);

  fs.mkdirSync(WORK, { recursive: true });
  for (const name of fs.readdirSync(release)) {
    const ext = path.extname(name);
    if (!INSTALLERS.includes(ext)) continue;
    const out = `RapidVis-${version}-${platform}${ext === '.exe' ? '-setup' : ''}${ext}`;
    fs.copyFileSync(path.join(release, name), path.join(DIST, out));
    console.log(`Viewer: dist/${out}`);
  }

  // A tar, not a zip: it keeps the app's programs runnable and the macOS bundle's links intact,
  // which Blender's zip install would lose
  const archive = viewerArchive(version, platform);
  const from = path.join(release, unpacked);
  const to = path.relative(from, archive).split(path.sep).join('/'); // relative: tar on Windows reads C: as a host
  run('tar', ['-czf', to, '.'], from);
  console.log(`Viewer for the add-on: ${path.relative(ROOT, archive)}`);
}

const viewerArchive = (version, platform) =>
  path.join(WORK, `rapidvis-viewer-${version}-${platform}.tar.gz`);

// --- The add-on ---

/** The Blender add-on for one platform, with that platform's viewer inside it. */
function buildAddon(version, platform, blender) {
  const archive = viewerArchive(version, platform);
  if (!fs.existsSync(archive)) {
    throw new Error(
      `No viewer built for ${platform} yet (${path.relative(ROOT, archive)}): run the viewer build first`,
    );
  }

  const entries = [];
  for (const name of fs.readdirSync(ADDON, { recursive: true })) {
    const file = path.join(ADDON, name);
    if (fs.statSync(file).isDirectory() || /__pycache__|\.pyc$/.test(name)) continue;
    entries.push({ name: name.split(path.sep).join('/'), data: fs.readFileSync(file) });
  }
  // The manifest: this version, and only this platform (its viewer won't run anywhere else)
  const manifest = entries.find((entry) => entry.name === 'blender_manifest.toml');
  manifest.data = Buffer.from(
    manifest.data
      .toString('utf8')
      .replace(/^version = ".*"$/m, `version = "${version}"`)
      .replace(/^(blender_version_min = .*)$/m, `$1\nplatforms = ["${platform}"]`),
  );
  // Named for the version alone: the add-on unpacks it into a folder of the same name
  entries.push({ name: `bundled/rapidvis-viewer-${version}.tar.gz`, data: fs.readFileSync(archive) });

  const out = path.join(DIST, `rapidvis-blender-${version}-${platform}.zip`);
  fs.writeFileSync(out, zip(entries));
  console.log(`Blender add-on: ${path.relative(ROOT, out)}`);

  if (blender) run(blender, ['--command', 'extension', 'validate', out]);
}

/**
 * A zip of `entries`, made here so the build needs nothing installed. Files are stored as Unix
 * files (mode 644) with a fixed date, so the same input always makes the same zip.
 */
function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const stored = name.endsWith('.gz'); // already compressed
    const body = stored ? data : zlib.deflateRawSync(data, { level: 9 });
    const method = stored ? 0 : 8;
    const crc = zlib.crc32(data);
    const DOS_DATE = 0x21; // 1980-01-01, midnight

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so the mode below counts
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE((0o100644 << 16) >>> 0, 38); // a regular file, rw-r--r--
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

// --- Command line ---

function hostPlatform() {
  const os = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform];
  return `${os}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
}

function main(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'all';
  if (!COMMANDS.includes(command)) {
    throw new Error(`Unknown command "${command}". One of: ${COMMANDS.join(', ')}`);
  }
  const option = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const version = readVersion();
  if (command === 'version') {
    return syncVersion(version, { check: argv.includes('--check'), tag: option('--tag') });
  }

  const platform = option('--platform') ?? hostPlatform();
  if (!PLATFORMS[platform]) {
    throw new Error(`Unknown platform "${platform}". One of: ${Object.keys(PLATFORMS).join(', ')}`);
  }
  if (PLATFORMS[platform].host !== process.platform) {
    throw new Error(`${platform} can only be built on ${PLATFORMS[platform].host}, not ${process.platform}`);
  }
  fs.mkdirSync(DIST, { recursive: true });
  if (command === 'all' || command === 'viewer') {
    syncVersion(version);
    buildViewer(version, platform);
  }
  if (command === 'all' || command === 'addon') {
    buildAddon(version, platform, option('--blender') ?? process.env.BLENDER);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
}
