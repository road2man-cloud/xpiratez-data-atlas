// Prevent the deleted legacy X-Piratez v.o1.1.1 ruleset from reappearing
// in publicly served source paths. This is deliberately not a claim that
// older generated database outputs or historical git objects are gone.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const retiredPaths = [
  'public/ruleset/Piratez.rul',
  'public/ruleset/Ruleset/Piratez.rul',
];
const bad = retiredPaths.filter(p => fs.existsSync(path.join(root, p)));
const rulesPath = path.join(root, 'public', 'ruleset');
if (fs.existsSync(rulesPath)) {
  for (const entry of fs.readdirSync(rulesPath, { withFileTypes: true })) {
    if (entry.isFile() && /\.rul$/i.test(entry.name)) {
      bad.push('public/ruleset/' + entry.name);
    }
  }
}
if (bad.length) {
  console.error('Retired ruleset source must not be published:', [...new Set(bad)].join(', '));
  process.exit(1);
}
console.log('No retired public/ruleset source files found.');
