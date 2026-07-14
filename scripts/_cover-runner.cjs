
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const htmlPath = process.env.COVER_HTML;
const outPath = process.env.COVER_OUT;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 640,
    show: false,
    frame: false,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
    },
  });
  win.setContentSize(1280, 640);
  await win.loadFile(htmlPath);
  // Wait for fonts / layout
  await new Promise((r) => setTimeout(r, 1200));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 640 });
  fs.writeFileSync(outPath, image.toPNG());
  console.log('WROTE', outPath, image.getSize());
  app.quit();
});
