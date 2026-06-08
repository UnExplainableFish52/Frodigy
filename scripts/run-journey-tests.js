const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const electronPath = require('electron');
const result = spawnSync(electronPath, [path.join(root, 'scripts', 'journey-tests.js')], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  },
  encoding: 'utf8'
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(result.status ?? 1);
