const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
(async function(){
  const vcon = new VirtualConsole();
  vcon.on('log', msg => console.log('[window]', msg));
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', virtualConsole: vcon });
  const { window } = dom;
  await new Promise(res => window.addEventListener('load', res));
  const startBtn = window.document.getElementById('startBtn');
  const simple = window.document.getElementById('simpleLoader');
  const percent = window.document.getElementById('simpleLoaderPercent');
  const screen2 = window.document.getElementById('screen-2');
  console.log('startBtn exists', !!startBtn);
  startBtn.click();
  // wait a bit
  await new Promise(r=>setTimeout(r,500));
  console.log('simple hidden?', simple.classList.contains('hidden'));
  console.log('percent text:', percent ? percent.textContent : 'no percent');
  console.log('screen2 hidden?', screen2.classList.contains('hidden'));
})();