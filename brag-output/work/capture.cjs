// Drives the real RapidVis viewer (the Vite dev server) offscreen and captures real frames of it.
// Run: electron capture.cjs   (env: APP_URL, OUT, FIXTURES)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const APP_URL = process.env.APP_URL || 'http://localhost:5199/';
const OUT = process.env.OUT;
const FIXTURES = process.env.FIXTURES;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    useContentSize: true,
    enableLargerThanScreen: true, // the full 1920×1080, even on a smaller screen
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.setContentSize(1920, 1080);
  win.webContents.setFrameRate(60);
  const freeCamera = async () => {
    await js(`(() => { document.querySelector('.camera-button').click(); return true; })()`);
    await wait(200);
    await js(`(() => { [...document.querySelectorAll('.menu-item')].find((i) => i.textContent.includes('Free camera')).click(); return true; })()`);
    await wait(200);
  };
  const js = (code) => win.webContents.executeJavaScript(code, true);
  async function shot(name, settle = 250) {
    await wait(settle);
    const image = await win.webContents.capturePage();
    const file = path.join(OUT, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, image.toPNG());
    const size = image.getSize();
    console.log('captured', name, size.width + 'x' + size.height);
  }
  const key = (code, k, extra = '') =>
    js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${k}', bubbles: true, cancelable: true ${extra} }))`);

  // A clean, known state: dark theme, panels shown, burn-in off
  await win.loadURL(APP_URL);
  await js(`localStorage.clear(); localStorage.setItem('rapidvis.theme', 'dark'); localStorage.setItem('rapidvis.burnIn', 'false'); true`);
  await win.loadURL(APP_URL);
  await js('document.fonts.ready.then(() => true)');
  await shot('empty.png', 800);

  // Open the test shot, as if picked in the file dialog
  const glb = fs.readFileSync(path.join(FIXTURES, 'test_shot.glb')).toString('base64');
  const manifest = fs.readFileSync(path.join(FIXTURES, 'test_shot.manifest.json')).toString('base64');
  await js(`(() => {
    const file = (b64, name) => new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name);
    const dt = new DataTransfer();
    dt.items.add(file('${glb}', 'test_shot.glb'));
    dt.items.add(file('${manifest}', 'test_shot.manifest.json'));
    const input = document.querySelector('#file-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    return true;
  })()`);
  await wait(1500);

  // The shot playing, seen from the free camera: every frame, 1 to 48
  await freeCamera();
  for (let f = 1; f <= 48; f++) {
    await shot(`play/${String(f).padStart(3, '0')}.png`, 120);
    await key('ArrowRight', 'ArrowRight');
  }

  // A few frames in, with the cube selected
  for (let i = 0; i < 18; i++) await key('ArrowLeft', 'ArrowLeft');
  await js(`(() => { [...document.querySelectorAll('.outliner-row')].find((r) => r.textContent.includes('cube')).click(); return true; })()`);
  await shot('free.png', 600);

  // Typing a real command, letter by letter, with the real autocomplete
  const text = 'retime cube 1.5';
  await js(`document.querySelector('#command-input').focus(), true`);
  for (let i = 1; i <= text.length; i++) {
    await js(`(() => {
      const input = document.querySelector('#command-input');
      input.value = ${JSON.stringify(text)}.slice(0, ${i});
      input.setSelectionRange(${i}, ${i});
      input.dispatchEvent(new Event('input'));
      return true;
    })()`);
    await shot(`type/${String(i).padStart(2, '0')}.png`, 140);
  }
  await js(`document.querySelector('#command-input').closest('form').requestSubmit(), true`);
  await shot('typed.png', 400);

  // Two more notes, then the history and the Compare toggle
  for (const command of ['intensity key_light 1.4', 'focal shotCam 35']) {
    await js(`(() => { const i = document.querySelector('#command-input'); i.value = ${JSON.stringify(command)}; i.closest('form').requestSubmit(); return true; })()`);
    await wait(200);
  }
  await js(`document.querySelector('#command-input').blur(), true`);
  await shot('history.png', 400);
  await key('KeyC', 'c');
  await shot('compare.png', 400);
  await key('KeyC', 'c');

  // The burn-in on
  await key('Escape', 'Escape');
  for (let i = 0; i < 6; i++) await key('ArrowRight', 'ArrowRight');
  await key('KeyB', 'b');
  await shot('burnin.png', 500);

  // The Export dialog
  await key('KeyE', 'e', ', ctrlKey: true');
  await shot('export.png', 500);

  await js(`localStorage.clear(), true`);
  app.quit();
});
