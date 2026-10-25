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
import { createRequire as topLevelCreateRequire } from 'module';
const require = topLevelCreateRequire(import.meta.url);
        `,
  },
  external: [
    '@fastify/swagger', 
    '@fastify/swagger-ui', 
    'bcrypt'
  ],
});
