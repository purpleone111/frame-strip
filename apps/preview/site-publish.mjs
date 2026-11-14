// After `vite build`: make the public page the home page, and keep the workbench at /workbench.html.
import { copyFileSync, existsSync } from 'node:fs';

const dist = new URL('../../dist/', import.meta.url);
const file = (name) => new URL(name, dist);

if (!existsSync(file('site.html'))) throw new Error('dist/site.html is missing. Run the build first.');

copyFileSync(file('index.html'), file('workbench.html'));
copyFileSync(file('site.html'), file('index.html'));
console.log('dist/index.html is now the public page. The workbench is at dist/workbench.html.');
