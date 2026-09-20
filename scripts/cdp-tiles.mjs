// Renders a spritesheet zoomed with tile indices so frame numbers can be read, not guessed.
// Usage: node scripts/cdp-tiles.mjs http://localhost:3111/assets/terrain/grass_meadow.png 16 16 /tmp/tiles.png [rowStart rowEnd]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [src, tw = '16', th = '16', out = '/tmp/tiles.png', rowStart = '0', rowEnd = '99'] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const html = `<!doctype html><body style="margin:0;background:#222"><canvas id=c></canvas><script>
const img=new Image();img.src=${JSON.stringify(src)};img.onerror=()=>{document.title='imgerror'};img.onload=()=>{
const Z=5,tw=${tw},th=${th},cols=img.width/tw,rows=img.height/th,r0=${rowStart},r1=Math.min(rows-1,${rowEnd});
const c=document.getElementById('c');c.width=cols*tw*Z;c.height=(r1-r0+1)*th*Z;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
x.fillStyle='#ff00ff';x.fillRect(0,0,c.width,c.height);
x.drawImage(img,0,r0*th,img.width,(r1-r0+1)*th,0,0,c.width,c.height);
x.strokeStyle='rgba(255,255,255,.5)';x.font='bold 12px monospace';x.fillStyle='#fff';
for(let r=r0;r<=r1;r++)for(let q=0;q<cols;q++){const px=q*tw*Z,py=(r-r0)*th*Z;x.strokeRect(px+.5,py+.5,tw*Z,th*Z);const s=String(r*cols+q);x.fillStyle='#000';x.fillText(s,px+3,py+13);x.fillStyle='#fff';x.fillText(s,px+2,py+12);}
document.title='ready:'+c.width+'x'+c.height;};
</script>`;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1600,1200', '--no-first-run', '--user-data-dir=C:/Users/Jayden/AppData/Local/Temp/tiles-profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} if (!wsUrl) await sleep(250); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url: new URL(src).origin + '/favicon.ico' });
await sleep(1500);
const bodyHtml = html.slice(html.indexOf('<body'));
const script = bodyHtml.slice(bodyHtml.indexOf('<script>') + 8, bodyHtml.indexOf('</script>'));
await send('Runtime.evaluate', { expression: `document.documentElement.innerHTML = ${JSON.stringify(bodyHtml.replace(/<script>[\s\S]*<\/script>/, ''))}; (function(){ ${script} })();` });
let size = '';
for (let i = 0; i < 40 && !size.startsWith('ready:'); i++) { await sleep(250); size = (await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result?.result?.value ?? ''; }
if (!size.startsWith('ready:')) { console.log('page never became ready; title=', JSON.stringify(size)); chrome.kill(); process.exit(1); }
const [w, h] = size.replace('ready:', '').split('x').map(Number);
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
writeFileSync(out, Buffer.from(r.result.data, 'base64'));
console.log('wrote', out, size);
ws.close(); chrome.kill(); process.exit(0);
