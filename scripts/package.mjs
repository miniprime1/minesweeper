import { packager } from '@electron/packager';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './prepare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const options = new Map();
for (const arg of process.argv.slice(2)) {
  const match = /^--(platform|arch)=(.+)$/.exec(arg);
  if (!match || options.has(match[1])) throw new Error('Usage: pnpm package [--platform=darwin|win32|linux] [--arch=arm64|x64]');
  options.set(match[1], match[2]);
}
const platform = options.get('platform') || process.platform;
const arch = options.get('arch') || process.arch;
if (!['darwin', 'win32', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('Unsupported platform or architecture.');
if (platform === 'darwin' && process.platform !== 'darwin') throw new Error('Build the macOS app on macOS so its signature can be verified.');
const output = path.join(root, 'release');
const cache = path.resolve(root, process.env.ELECTRON_CACHE || '.cache/electron');
const electronVersion = metadata.devDependencies.electron;
const electronZip = `electron-v${electronVersion}-${platform}-${arch}.zip`;

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
function run(command, values, cwd = root) {
  const result = spawnSync(command, values, { cwd, stdio: 'inherit', env: {...process.env, COPYFILE_DISABLE: '1'} });
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
    platform, arch, electronVersion, electronZipDir: await cachedZipDirectory(),
    appBundleId: 'local.minesweeper.windows2000', appCategoryType: 'public.app-category.puzzle-games',
    appCopyright: 'Copyright (c) 2026 Kyumin Nam. MIT License (program code). Third-party resources retain their respective licenses.',
    icon: path.join(root, platform === 'darwin' ? 'resources/Minesweeper.icns' : platform === 'win32' ? 'src/assets/minesweeper.ico' : 'src/assets/app-icon.png'),
    asar: true, overwrite: true, prune: false, download: { cacheRoot: cache },
  });
  for (const directory of apps) {
    const app = path.join(directory, 'Minesweeper.app');
    const resources = platform === 'darwin' ? path.join(app, 'Contents/Resources') : path.join(directory, 'resources');
    const noticesDirectory = path.join(resources, 'notices');
    await mkdir(noticesDirectory, {recursive: true});
    await cp(path.join(directory, 'LICENSE'), path.join(noticesDirectory, 'LICENSE-Electron.txt'));
    await cp(path.join(directory, 'LICENSES.chromium.html'), path.join(noticesDirectory, 'LICENSES.chromium.html'));
    await cp(path.join(root, 'LICENSE'), path.join(noticesDirectory, 'LICENSE-Minesweeper.txt'));
    await cp(path.join(root, 'src/assets/98-CSS-LICENSE.txt'), path.join(noticesDirectory, 'LICENSE-98-css.txt'));
    const notices = (await readFile(path.join(root, 'src/assets/ASSET-SOURCES.md'), 'utf8'))
      .replaceAll('(PROGRAM-LICENSE.txt)', '(LICENSE-Minesweeper.txt)')
      .replaceAll('(98-CSS-LICENSE.txt)', '(LICENSE-98-css.txt)');
    await writeFile(path.join(noticesDirectory, 'ASSET-SOURCES.md'), notices);
    const credits = (await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'))
        .replaceAll('(LICENSE)', '(LICENSE-Minesweeper.txt)')
        .replaceAll('(src/assets/ASSET-SOURCES.md)', '(ASSET-SOURCES.md)')
        .replaceAll('(src/assets/98-CSS-LICENSE.txt)', '(LICENSE-98-css.txt)');
    await writeFile(path.join(noticesDirectory, 'THIRD_PARTY_NOTICES.md'), credits);
    if (platform === 'darwin') {
      run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    }
    const label = {darwin: 'macOS', win32: 'Windows', linux: 'Linux'}[platform];
    const archive = path.join(output, `Minesweeper-${label}-${arch}.${platform === 'win32' ? 'zip' : 'tar.gz'}`);
    await rm(archive, {force: true});
    if (platform === 'win32') {
      if (process.platform === 'win32') {
        const literal = value => "'" + value.replaceAll("'", "''") + "'";
        run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -LiteralPath ${literal(directory)} -DestinationPath ${literal(archive)} -Force`]);
      } else run('zip', ['-q', '-r', archive, path.basename(directory)], output);
    } else {
      const flags = process.platform === 'darwin' ? ['--no-xattrs'] : [];
      const folder = platform === 'darwin' ? 'Minesweeper.app' : path.basename(directory);
      run('tar', [...flags, '-czf', archive, '-C', platform === 'darwin' ? directory : output, folder]);
    }
    console.log('Packaged: ' + path.relative(root, archive));
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
