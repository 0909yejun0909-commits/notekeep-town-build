// End-to-end smoke test: title -> demo town -> walk into a door -> interior -> bookshelf -> note.
// Usage: node scripts/cdp-main.mjs http://localhost:3000 /tmp/main
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [url = 'http://localhost:3000', outDir = '/tmp/main'] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
mkdirSync(outDir, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-first-run',
  '--user-data-dir=C:/Users/Jayden/AppData/Local/Temp/main-profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} if (!wsUrl) await sleep(250); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('console.error ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); console.log('shot', name); };
const key = async (k, code, keyCode) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode }); await sleep(140); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode }); };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(6000);
await shot('01-title');
await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('demo')); b && b.click(); return !!b; })()`);
await sleep(3500);
console.log('active scenes:', await evaluate(`JSON.stringify(window.__game.scene.getScenes(true).map(s=>s.scene.key))`));
await shot('02-overworld');

// Teleport to the tile below a door, then step up onto it.
const door = await evaluate(`(() => { const s=window.__game.scene.getScene('OverworldScene'); const [k,houseId]=[...s.doors.entries()][0]; const [gx,gy]=k.split(',').map(Number); s.movement.snapTo(gx, gy+1); s.lastDoorKey=null; return JSON.stringify({gx,gy,houseId}); })()`);
console.log('door:', door);
await sleep(300);
await shot('03-at-door');
await key('ArrowUp', 'ArrowUp', 38);
await sleep(1500);
console.log('active scenes after door:', await evaluate(`JSON.stringify(window.__game.scene.getScenes(true).map(s=>s.scene.key))`));
await shot('04-interior');
for (let i = 0; i < 11; i++) { await key('ArrowUp', 'ArrowUp', 38); await sleep(320); }
await sleep(300);
await key(' ', 'Space', 32);
await sleep(800);
await shot('05-shelf');
const noteRect = await evaluate(`(() => { const n=[...document.querySelectorAll('button[title]')].find(b=>b.style.getPropertyValue('--w')); if(!n) return null; const r=n.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,t:n.textContent,folder:n.title.endsWith(')')}; })()`);
console.log('first book:', JSON.stringify(noteRect));
if (noteRect) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: noteRect.x, y: noteRect.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: noteRect.x, y: noteRect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: noteRect.x, y: noteRect.y, button: 'left', clickCount: 1 });
  await sleep(1200);
  await shot('06-clicked-book');
}
for (let i = 0; i < 3; i++) { await key('Escape', 'Escape', 27); await sleep(300); }
for (let i = 0; i < 12; i++) { await key('ArrowDown', 'ArrowDown', 40); await sleep(320); }
await sleep(1200);
console.log('active scenes after exit:', await evaluate(`JSON.stringify(window.__game.scene.getScenes(true).map(s=>s.scene.key))`));
await shot('07-back-outside');
console.log('--- errors ---\n' + (logs.join('\n') || 'none'));
ws.close(); chrome.kill(); process.exit(0);
