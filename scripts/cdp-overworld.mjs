// Loads the demo town in headless Chrome, checks canvas fit/centering, and screenshots the overworld.
// Usage: node scripts/cdp-overworld.mjs http://localhost:3111 /tmp/ow
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [url = 'http://localhost:3111', outDir = '/tmp/ow'] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
mkdirSync(outDir, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-first-run',
  '--user-data-dir=C:/Users/Jayden/AppData/Local/Temp/ow-profile', 'about:blank'], { stdio: 'ignore' });
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
const key = async (k, code, keyCode) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode }); await sleep(60); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode }); };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(6000);
console.log('canvas @1920x1080:', await evaluate(`(() => { const c=document.querySelector('canvas'); if(!c) return 'none'; const r=c.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,win:[innerWidth,innerHeight]}); })()`));
await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('demo')); b && b.click(); return !!b; })()`);
await sleep(3500);
await shot('01-overworld');
for (let i = 0; i < 6; i++) { await key('ArrowRight', 'ArrowRight', 39); await sleep(190); }
for (let i = 0; i < 4; i++) { await key('ArrowUp', 'ArrowUp', 38); await sleep(190); }
await sleep(300);
await shot('02-walked');
console.log('scene info:', await evaluate(`(() => { const s=window.__game.scene.getScene('OverworldScene'); const cam=s.cameras.main; return JSON.stringify({bounds:[cam.getBounds().width, cam.getBounds().height], imgs:s.children.list.length}); })()`));
await evaluate(`(() => { const s=window.__game.scene.getScene('OverworldScene'); const cam=s.cameras.main; cam.stopFollow(); const b=cam.getBounds(); const z=Math.min(320/b.width, 240/b.height); cam.setZoom(z); cam.centerOn(b.width/2, b.height/2); return z; })()`);
await sleep(500);
await shot('03-overview');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await evaluate(`window.dispatchEvent(new Event('resize')); true`);
await sleep(500);
console.log('canvas @1280x800:', await evaluate(`(() => { const c=document.querySelector('canvas'); const r=c.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,win:[innerWidth,innerHeight]}); })()`));
await shot('04-resized');
console.log('--- errors ---\n' + (logs.join('\n') || 'none'));
ws.close(); chrome.kill(); process.exit(0);
