// Node recorder — mirrors build_video.py using the preinstalled Node Playwright.
// Usage: node record_dive.js scenes.json out.mp4
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const CHROME = '/opt/pw-browsers/chromium';

(async () => {
  const [scenesPath, outPath] = process.argv.slice(2);
  if (!scenesPath || !outPath) { console.error('usage: node record_dive.js scenes.json out.mp4'); process.exit(2); }
  const scenesText = fs.readFileSync(scenesPath, 'utf8').trim();
  JSON.parse(scenesText); // validate
  const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const html = tpl.replace('/*__SCENES__*/ {}', scenesText);
  const work = path.join(__dirname, '_work'); fs.mkdirSync(work, { recursive: true });
  const pageHtml = path.join(work, 'page.html'); fs.writeFileSync(pageHtml, html);
  const recdir = path.join(work, 'rec'); fs.rmSync(recdir, { recursive: true, force: true }); fs.mkdirSync(recdir, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-color-profile=srgb', '--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1,
    recordVideo: { dir: recdir, size: { width: 1080, height: 1080 } },
  });
  const pg = await ctx.newPage();
  await pg.goto('file://' + pageHtml);
  await pg.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
  await new Promise(r => setTimeout(r, 300));
  await ctx.close(); await browser.close();

  const webm = fs.readdirSync(recdir).filter(f => f.endsWith('.webm')).map(f => path.join(recdir, f)).sort().pop();
  if (!webm) { console.error('ERR: no webm recorded'); process.exit(1); }
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString().trim());
  const fout = Math.max(0, dur - 0.5);
  execFileSync('ffmpeg', ['-y', '-i', webm,
    '-vf', `fps=30,format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${fout}:d=0.5`,
    '-c:v', 'libx264', '-profile:v', 'high', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', outPath], { stdio: 'ignore' });
  console.log('OK', outPath, dur.toFixed(1) + 's');
})().catch(e => { console.error('ERR', e); process.exit(1); });
