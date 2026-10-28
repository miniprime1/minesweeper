import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'web');

// Keep the desktop output reproducible when source assets are removed or renamed.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(root, 'src'), target, { recursive: true });
for (const file of ['desktop.css', 'native-dialog.html', 'native-dialog.css']) {
  await cp(path.join(root, 'electron', file), path.join(target, file));
}
const index = path.join(target, 'index.html');
const html = (await readFile(index, 'utf8')).replace(
  '</head>',
  '  <link rel="stylesheet" href="desktop.css">\n</head>',
);
await writeFile(index, html);
console.log('Desktop web assets prepared in web/.');
