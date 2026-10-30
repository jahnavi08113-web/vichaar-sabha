import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export async function build() {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/main.jsx')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2019'],
    outdir: path.join(root, 'dist/.tmp'),
    write: false,
    jsx: 'automatic',
    loader: { '.webp': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
  });
  const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
  const css = (result.outputFiles.find((f) => f.path.endsWith('.css')) || { text: '' }).text;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#e9d8bd" />
<meta name="description" content="Vichaar Sabha — the court of better ideas. An interactive, scripted courtroom hearing demo." />
<title>Vichaar Sabha — The court of better ideas</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<noscript><p style="font-family:Georgia,serif;padding:2rem">Vichaar Sabha needs JavaScript to run the interactive hearing.</p></noscript>
<script>${js}</script>
</body>
</html>`;
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  const out = path.join(root, 'dist/index.html');
  await fs.writeFile(out, html);
  return { out, bytes: Buffer.byteLength(html) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build()
    .then(({ out, bytes }) => console.log(`Built ${path.relative(root, out)} (${(bytes / 1024).toFixed(0)} KB)`))
    .catch((err) => { console.error(err); process.exit(1); });
}
