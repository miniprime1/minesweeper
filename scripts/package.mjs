import { packager } from '@electron/packager';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './prepare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
if (args.some(value => !/^--arch=(arm64|x64)$/.test(value)) || args.length > 1) {
  throw new Error('Usage: pnpm package:mac [--arch=arm64|x64]');
}
const arch = args[0]?.slice('--arch='.length) || process.arch;
if (!['arm64', 'x64'].includes(arch)) throw new Error('Choose --arch=arm64 or --arch=x64.');
if (process.platform !== 'darwin') throw new Error('Package the macOS app on macOS to sign and create its ZIP.');
const output = path.join(root, 'release');
const cache = path.resolve(root, process.env.ELECTRON_CACHE || '.cache/electron');
const electronVersion = metadata.devDependencies.electron;
const electronZip = `electron-v${electronVersion}-darwin-${arch}.zip`;

// @electron/get uses hashed subdirectories; an existing official download works offline too.
async function cachedZipDirectory() {
  try {
    const entries = await readdir(cache, { withFileTypes: true });
    if (entries.some(entry => entry.isFile() && entry.name === electronZip)) return cache;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const directory = path.join(cache, entry.name);
        if ((await readdir(directory)).includes(electronZip)) return directory;
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function run(command, values) {
  const result = spawnSync(command, values, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal}).`);
}

await mkdir(output, { recursive: true });
await mkdir(cache, { recursive: true });
const stage = await mkdtemp(path.join(os.tmpdir(), 'minesweeper-package-'));
try {
  for (const directory of ['electron', 'web']) await cp(path.join(root, directory), path.join(stage, directory), { recursive: true });
  await cp(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
  const { name, productName, version, description, main, author, license } = metadata;
  await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name, productName, version, description, main, author, license }, null, 2) + '\n');
  const apps = await packager({
    dir: stage, out: output, name: 'Minesweeper', executableName: 'Minesweeper',
    platform: 'darwin', arch, electronVersion, electronZipDir: await cachedZipDirectory(),
    appBundleId: 'local.minesweeper.windows2000', appCategoryType: 'public.app-category.puzzle-games',
    appCopyright: 'Copyright (c) 2026 Kyumin Nam. MIT License (program code). Third-party resources retain their respective licenses.',
    icon: path.join(root, 'resources/Minesweeper.icns'),
    asar: true, overwrite: true, prune: false, download: { cacheRoot: cache },
  });
  for (const directory of apps) {
    await cp(path.join(root, 'LICENSE'), path.join(directory, 'LICENSE-Minesweeper.txt'));
    await cp(path.join(root, 'src/assets/98-CSS-LICENSE.txt'), path.join(directory, 'LICENSE-98-css.txt'));
    const notices = (await readFile(path.join(root, 'src/assets/ASSET-SOURCES.md'), 'utf8'))
      .replaceAll('(PROGRAM-LICENSE.txt)', '(LICENSE-Minesweeper.txt)')
      .replaceAll('(98-CSS-LICENSE.txt)', '(LICENSE-98-css.txt)');
    await writeFile(path.join(directory, 'ASSET-SOURCES.md'), notices);
    // Release folders carry the same code/resource distinction as the source repository.
    for (const filename of ['README.md', 'README.ko.md', 'THIRD_PARTY_NOTICES.md']) {
      let content = await readFile(path.join(root, filename), 'utf8');
      content = content.replaceAll('(LICENSE)', '(LICENSE-Minesweeper.txt)')
        .replaceAll('(src/assets/ASSET-SOURCES.md)', '(ASSET-SOURCES.md)')
        .replaceAll('(src/assets/98-CSS-LICENSE.txt)', '(LICENSE-98-css.txt)');
      await writeFile(path.join(directory, filename), content);
    }
    await cp(path.join(root, 'docs'), path.join(directory, 'docs'), { recursive: true });
    const app = path.join(directory, 'Minesweeper.app');
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    const zip = path.join(output, `Minesweeper-macOS-${arch}.zip`);
    await rm(zip, { force: true });
    run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', directory, zip]);
    console.log('Packaged: ' + path.relative(root, zip));
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
