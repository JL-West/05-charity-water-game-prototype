const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

(async function(){
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });
  const { window } = dom;
  // Wait for the external script to load
  await new Promise(res => window.addEventListener('load', res));

  // Access the showJerryLoading function
  const showJerryLoading = window.showJerryLoading || window.parent && window.parent.showJerryLoading || window.document && window.document.defaultView && window.document.defaultView.showJerryLoading;
  // As script.js attaches functions internally, it may not be on window - attempt to get via eval
  let fn = null;
  try {
    fn = window.eval('showJerryLoading');
  } catch (e) {
    // ignore
  }
  const jerry = window.document.getElementById('jerryLoader');
  const rect = jerry ? jerry.querySelector('.water') : null;

  console.log('jerry exists:', !!jerry);
  console.log('rect exists:', !!rect);

  // Click the demo button (the event listener calls showJerryLoading inside page scope)
  const demoBtn = window.document.getElementById('demoLoadBtn');
  if (demoBtn) {
    console.log('Clicking demo button...');
    demoBtn.click();
    // Wait a bit for animation to run
    await new Promise(r => setTimeout(r, 900));
    console.log('After click: jerry hidden?', jerry.classList.contains('hidden'));
    if (rect) console.log('After click: rect height=', rect.getAttribute('height'), 'y=', rect.getAttribute('y'));
  } else {
    console.log('Demo button not found; cannot trigger loader.');
  }
})();
