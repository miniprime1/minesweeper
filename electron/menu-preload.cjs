'use strict';
const {ipcRenderer} = require('electron');
let current = null, host = null, lastItems = '';
ipcRenderer.on('minesweeper:menu-snapshot', (_event, snapshot) => {
  if (!host || !snapshot || !Array.isArray(snapshot.items)) return;
  current = snapshot;
  const key = JSON.stringify(snapshot.items);
  if (key !== lastItems) {
    lastItems = key; host.replaceChildren();
    for (const item of snapshot.items) {
      if (!item) {
        const separator = document.createElement('div');
        separator.className = 'separator'; separator.role = 'separator'; host.append(separator); continue;
      }
      const button = document.createElement('button');
      button.dataset.action = item.id;
      button.role = item.checkable ? 'menuitemcheckbox' : 'menuitem';
      if (item.checkable) button.setAttribute('aria-checked', String(item.checked));
      if (item.checked) {
        const check = document.createElement('span'); check.className = 'check'; check.textContent = '✓'; button.append(check);
      }
      button.append(document.createTextNode(item.label));
      if (item.shortcut) {
        const shortcut = document.createElement('span'); shortcut.className = 'shortcut'; shortcut.textContent = item.shortcut; button.append(shortcut);
      }
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('mousemove', () => {
        if (current.selected !== item.id) ipcRenderer.send('minesweeper:menu-action', {token: current.token, kind: 'hover', id: item.id});
      });
      button.addEventListener('click', () => ipcRenderer.send('minesweeper:menu-action', {token: current.token, kind: 'activate', id: item.id}));
      host.append(button);
    }
  }
  for (const button of host.querySelectorAll('button')) button.classList.toggle('selected', button.dataset.action === snapshot.selected);
});
window.addEventListener('DOMContentLoaded', async () => {
  host = document.getElementById('native-menu');
  document.addEventListener('contextmenu', event => event.preventDefault());
  await document.fonts.load('11px "MS Sans Serif"'); await document.fonts.ready;
  ipcRenderer.send('minesweeper:menu-ready');
});
