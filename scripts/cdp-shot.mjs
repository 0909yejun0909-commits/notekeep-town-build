// Drives the running dev server through headless Chrome via CDP and saves screenshots.
// Usage: node scripts/cdp-shot.mjs http://localhost:3111 /tmp/shots
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [url = 'http://localhost:3111', outDir = '/tmp/shots'] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1280,900',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-first-run', '--user-data-dir=' + outDir + '/profile', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome did not start');
}

const ws = new WebSocket(await getTarget());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + JSON.stringify(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('shot', name);
};
const key = async (k, code, keyCode) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode });
  await sleep(60);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode });
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(6000);
await shot('01-title');

await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('demo')); b && b.click(); return !!b; })()`);
await sleep(3000);
console.log('world regions:', await evaluate(`JSON.stringify((window.__game?.registry.get('world')?.regions||[]).map(r=>[r.name, r.houses.map(h=>h.id)]))`));
await shot('02-after-demo');

const houseId = await evaluate(`window.__game.registry.get('world').regions.find(r=>r.name==='Robotics').houses.find(h=>h.rooms.length>1).id`);
console.log('entering', houseId);
await evaluate(`window.__game.scene.start('InteriorScene', { houseId: ${JSON.stringify(houseId)} }); true`);
await sleep(1500);
await shot('03-interior');

// Walk up from the door to the shelf approach row, then press Space.
for (let i = 0; i < 11; i++) { await key('ArrowUp', 'ArrowUp', 38); await sleep(190); }
await sleep(400);
await shot('04-at-shelf');
await key(' ', 'Space', 32);
await sleep(800);
await shot('05-shelf-open');

const folderCount = await evaluate(`document.querySelectorAll('button[title$=")"]').length`);
console.log('folder books:', folderCount);
await evaluate(`(() => { const f=[...document.querySelectorAll('button[title$=")"]')][0]; f && f.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); return !!f; })()`);
// Hover via real mouse move for the CSS :hover state.
const rect = await evaluate(`(() => { const f=[...document.querySelectorAll('button[title$=")"]')][0]; if(!f) return null; const r=f.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
if (rect) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await sleep(400);
  await shot('06-hover-folder');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await sleep(500);
  await shot('07-inside-folder');
}
const noteRect = await evaluate(`(() => { const n=[...document.querySelectorAll('button[title]')].find(b=>!b.title.endsWith(')') && b.style.getPropertyValue('--w')); if(!n) return null; const r=n.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2, t:n.textContent}; })()`);
console.log('note book:', JSON.stringify(noteRect));
if (noteRect) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: noteRect.x, y: noteRect.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: noteRect.x, y: noteRect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: noteRect.x, y: noteRect.y, button: 'left', clickCount: 1 });
  await sleep(1200);
  await shot('08-note-open');
  await key('Escape', 'Escape', 27);
  await sleep(500);
  await shot('09-after-esc-note');
  await key('Escape', 'Escape', 27);
  await sleep(500);
  await shot('10-after-esc-back');
  await key('Escape', 'Escape', 27);
  await sleep(500);
  await shot('11-after-esc-close');
}
console.log('--- console ---\n' + logs.join('\n'));
ws.close();
chrome.kill();
process.exit(0);
