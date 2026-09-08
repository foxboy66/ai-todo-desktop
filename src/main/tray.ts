import { Menu, nativeImage, Tray, type BrowserWindow } from 'electron';

export function restoreMainWindow(window: BrowserWindow) {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

export function createAppTray(window: BrowserWindow, iconPath: string, quit: () => void) {
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  const openWindow = () => restoreMainWindow(window);
  tray.setToolTip('AI ToDo');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 AI ToDo', click: openWindow },
    { label: '退出', click: quit },
  ]));
  tray.on('click', openWindow);
  tray.on('double-click', openWindow);
  return tray;
}
