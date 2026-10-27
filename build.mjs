// Build: copies public/ -> dist/ and bundles src/main.js -> dist/js/app.js
// The output is a plain static site: double-click dist/index.html, or drag dist/ to Netlify Drop.
//   npm run build   -> one build
//   npm run dev     -> rebuild on every save
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, watch } from 'node:fs';

const watching = process.argv.includes('--watch');

const copyPublic = () => {
  mkdirSync('dist', { recursive: true });
  cpSync('public', 'dist', { recursive: true });
};

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife', // classic script, so index.html also works from file://
  minify: !watching,
  sourcemap: watching,
  target: ['es2020'],
  outfile: 'dist/js/app.js',
  logLevel: 'info',
};

rmSync('dist', { recursive: true, force: true });
copyPublic();

if (watching) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  watch('public', { recursive: true }, copyPublic);
  console.log('watching src/ and public/ ...');
} else {
  await esbuild.build(options);
}
