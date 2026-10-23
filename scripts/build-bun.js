// Alternative build using Bun's bundler (no npm install needed): `bun scripts/build-bun.js`
// Produces the same dist/meowengine.user.js as `pnpm build` (Parcel).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');

// Parcel's "bundle-text:" scheme: inline a CSS file (following @import) as a string.
const inlineCss = (file) =>
  readFileSync(file, 'utf8').replace(/@import\s+["'](.+?)["'];?/g, (_, p) => inlineCss(resolve(dirname(file), p)));

const bundleText = {
  name: 'bundle-text',
  setup(build) {
    build.onResolve({ filter: /^bundle-text:/ }, (args) => ({
      path: resolve(dirname(args.importer), args.path.slice('bundle-text:'.length)),
      namespace: 'bundle-text',
    }));
    build.onLoad({ filter: /.*/, namespace: 'bundle-text' }, (args) => ({
      contents: `export default ${JSON.stringify(inlineCss(args.path))};`,
      loader: 'js',
    }));
  },
};

const minify = !process.argv.includes('--readable');
const out = await Bun.build({
  entrypoints: [resolve(root, 'src/index.js')],
  target: 'browser',
  format: 'iife',
  minify,
  plugins: [bundleText],
});
if (!out.success) {
  for (const l of out.logs) console.error(l);
  process.exit(1);
}
const code = await out.outputs[0].text();
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/index.js'), code);
writeFileSync(resolve(root, 'dist/meowengine.user.js'), readFileSync(resolve(root, 'header.js'), 'utf8') + code);
console.log(`dist/meowengine.user.js (${(code.length / 1024).toFixed(1)} KB${minify ? ', minified' : ''})`);
