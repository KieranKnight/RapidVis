// Renders video.html frame by frame: render(t) for each frame, then a capture.
// Run: electron render.cjs   (env: OUT, and TIMES="1.2,3.4" for stills, or FPS + DURATION for every frame)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = process.env.OUT;
const FPS = Number(process.env.FPS || 30);
const DURATION = Number(process.env.DURATION || 22);
const times = process.env.TIMES
  ? process.env.TIMES.split(',').map(Number)
  : Array.from({ length: Math.round(FPS * DURATION) }, (_, i) => i / FPS);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.setContentSize(1920, 1080);
  win.webContents.setFrameRate(60);
  await win.loadFile(path.join(__dirname, 'video.html'));
  await win.webContents.executeJavaScript('window.ready', true);
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    await win.webContents.executeJavaScript(`render(${t})`, true);
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1920, height: 1080 });
    const name = process.env.TIMES ? `still-${t.toFixed(2)}.png` : `${String(i).padStart(4, '0')}.png`;
    fs.writeFileSync(path.join(OUT, name), image.toPNG());
    if (i % 60 === 0) console.log('frame', i, 't', t.toFixed(2), image.getSize());
  }
  app.quit();
});
