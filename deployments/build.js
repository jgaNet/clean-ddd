import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/Bootstrap/Fastify/application.ts'],
  bundle: true,
  outfile: 'dist/application.js',
  format: 'esm',
  target: 'esnext',
  platform: 'node',
  banner: {
    js: `
import { fileURLToPath } from 'url';
import { createRequire as topLevelCreateRequire } from 'module';
import path from 'path';
const require = topLevelCreateRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
        `,
  },
  external: [
    '@fastify/swagger', 
    '@fastify/swagger-ui', 
    'bcrypt'
  ],
});
