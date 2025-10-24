const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

(async function(){
  const vcon = new VirtualConsole();
  vcon.on('log', msg => console.log('[window]', msg));
  vcon.on('error', msg => console.error('[window][error]', msg));
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', virtualConsole: vcon });
  const { window } = dom;
  await new Promise(res => window.addEventListener('load', res));

  const loadBtn = window.document.getElementById('loadBtn');
  const demoBtn = window.document.getElementById('demoLoadBtn');
  const jerry = window.document.getElementById('jerryLoader');
  const simple = window.document.getElementById('simpleLoader');
  const screen2 = window.document.getElementById('screen-2');

  console.log('loadBtn exists:', !!loadBtn);
  console.log('demoBtn exists:', !!demoBtn);

  if (demoBtn) {
    console.log('Clicking demoBtn...');
    demoBtn.click();
    await new Promise(r => setTimeout(r, 900));
    console.log('After demo: jerry hidden?', jerry.classList.contains('hidden'));
    console.log('screen2 visible?', !screen2.classList.contains('hidden'));
  }

  // Reset by reloading DOM
  const dom2 = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });
  const win2 = dom2.window;
  await new Promise(res => win2.addEventListener('load', res));
  const loadBtn2 = win2.document.getElementById('loadBtn');
  const jerry2 = win2.document.getElementById('jerryLoader');
  const screen22 = win2.document.getElementById('screen-2');
  if (loadBtn2) {
    console.log('Clicking loadBtn...');
    loadBtn2.click();
    await new Promise(r => setTimeout(r, 1000));
    console.log('After load: simpleLoader exists?', !!win2.document.getElementById('simpleLoader'));
    console.log('screen2 visible after load?', !screen22.classList.contains('hidden'));
  }

})();
