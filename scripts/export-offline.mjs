import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src');
const mimeTypes = {
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};
const urls = new Map();
async function dataURL(name) {
  if (!urls.has(name)) {
    const file = path.resolve(source, name);
    if (!file.startsWith(source + path.sep)) throw new Error('Invalid asset path: ' + name);
    const bytes = await readFile(file);
    urls.set(name, `data:${mimeTypes[path.extname(file)] || 'application/octet-stream'};base64,${bytes.toString('base64')}`);
  }
  return urls.get(name);
}
async function embedAssets(text) {
  const names = [...new Set(text.match(/assets\/[A-Za-z0-9_.\/-]+\.(?:png|ico|woff2|svg|jpe?g)/g) || [])];
  for (const name of names) text = text.replaceAll(name, await dataURL(name));
  return text;
}

let html = await readFile(path.join(source, 'index.html'), 'utf8');
const css = await embedAssets(await readFile(path.join(source, 'style.css'), 'utf8'));
const engine = (await readFile(path.join(source, 'engine.js'), 'utf8')).replace(/^export (const|class|function) /gm, '$1 ');
const sound = (await readFile(path.join(source, 'sound.js'), 'utf8')).replace(/^export (const|class|function) /gm, '$1 ');
const app = await embedAssets((await readFile(path.join(source, 'app.js'), 'utf8')).replace(/^import[^\n]+\n/gm, ''));

html = html.replace(/<link rel="stylesheet" href="style\.css(?:\?[^\"]*)?">/, () => `<style>\n${css}\n</style>`);
html = await embedAssets(html);
const javascript = [engine, sound, app].join('\n').replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script type="module" src="app\.js(?:\?[^\"]*)?"><\/script>/, () => `<script type="module">\n${javascript}\n</script>`);
const notices = (await Promise.all(['PROGRAM-LICENSE.txt', '98-CSS-LICENSE.txt', 'ASSET-SOURCES.md'].map(name => readFile(path.join(source, 'assets', name), 'utf8')))).join('\n\n');
html = `<!--\n${notices.replaceAll('--', '—')}\n-->\n` + html;
await mkdir(path.join(root, 'release'), { recursive: true });
const target = path.join(root, 'release/Minesweeper.html');
await writeFile(target, html);
console.log(`Offline game: release/Minesweeper.html (${Buffer.byteLength(html).toLocaleString()} bytes).`);
