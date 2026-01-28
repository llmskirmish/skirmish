import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

// Read version from package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

// Build the CLI with all workspace dependencies bundled
await esbuild.build({
  entryPoints: [
    'src/index.ts',
    'src/init.ts',
    'src/run.ts',
    'src/validate.ts',
  ],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outdir: 'dist',
  splitting: true,
  sourcemap: false,
  minify: false,
  // Bundle workspace packages, externalize everything else
  external: [
    // Node builtins are automatically external
    // Keep ws external (optional peer dep of engine)
    'ws',
  ],
  banner: {
    // Add shebang to the main entry point
    js: '',
  },
  // Inject version at build time
  define: {
    '__VERSION__': JSON.stringify(pkg.version),
  },
  // Log what we're doing
  logLevel: 'info',
});

// Add shebang to index.js
const indexPath = 'dist/index.js';
const content = readFileSync(indexPath, 'utf-8');
if (!content.startsWith('#!')) {
  const { writeFileSync } = await import('fs');
  writeFileSync(indexPath, '#!/usr/bin/env node\n' + content);
}

console.log('✓ Build complete');
