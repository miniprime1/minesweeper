import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.resolve(root, process.env.ELECTRON_CACHE || '.cache/electron');
await mkdir(cache, { recursive: true });
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/electron/install.js')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, electron_config_cache: cache },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
