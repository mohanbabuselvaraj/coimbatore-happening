import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// A development fixture must never become a route, asset or executable chunk
// in a publication, even if the build configuration changes later.
const markers=['UI_LAB_FIXTURE_ONLY','UI data test','ui-lab-ready','X-UI-Fixture','/api/dev-ui/harness','Disposable local password test phrase only'];
let checked=0;
async function scan(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())await scan(file);
    else if(/\.(?:m?js|css|html|json|map|txt)$/u.test(entry.name)) {
      const source=await readFile(file,'utf8');checked++;
      for(const marker of markers)assert.ok(!source.includes(marker),`Development UI fixture found in ${file}: ${marker}`);
    }
  }
}
await scan('dist/client');await scan('dist/server');
console.log(`Production check passed: ${checked} text assets; no UI test harness or fixtures.`);
