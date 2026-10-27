/**
 * `yarn build`: the published package. Two bundles (the CLI and the API), the declarations, and
 * the part of the reference that `clean-ddd create` copies when it runs from an installed
 * package rather than from a checkout — the building blocks, the shared kernel's model, the
 * configuration and the contract, laid out as the repository is, so `create` reads them the
 * same way. ESLint is never bundled: the import rules are asked of the language's own linter.
 */
import { execFileSync } from 'child_process';
import { chmodSync, cpSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'tools/dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['eslint'],
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  absWorkingDir: root,
  logLevel: 'warning',
};
await esbuild.build({ ...common, entryPoints: ['tools/src/cli.ts'], outfile: 'tools/dist/cli.js' });
await esbuild.build({ ...common, entryPoints: ['tools/src/index.ts'], outfile: 'tools/dist/index.js' });
// The shebang goes on its own line, before the banner.
const { readFileSync, writeFileSync } = await import('fs');
writeFileSync(join(dist, 'cli.js'), `#!/usr/bin/env node\n${readFileSync(join(dist, 'cli.js'), 'utf8')}`);
chmodSync(join(dist, 'cli.js'), 0o755);

execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', 'tools/tsconfig.build.json'], { cwd: root, stdio: 'inherit' });

// What `create` copies: the same list as create.ts, plus what it reads (the contract, the package).
const reference = join(dist, 'reference');
for (const path of [
  'typescript/src/Architecture',
  'typescript/src/SharedKernel/Domain',
  'typescript/src/SharedKernel/Application/Guards.ts',
  'typescript/tsconfig.json',
  'typescript/tsconfig.test.json',
  'typescript/jest.config.js',
  'typescript/eslint.config.js',
  'typescript/.prettierrc.json',
  'typescript/.prettierignore',
  'typescript/.nvmrc',
  'typescript/package.json',
  'conventions/architecture.yaml',
  'conventions/concepts.yaml',
  'conventions/typescript.yaml',
  '.claude',
  '.editorconfig',
  'package.json',
]) {
  const to = join(reference, path);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(root, path), to, { recursive: true });
}
process.stdout.write('✓ tools/dist: cli.js, index.js, the declarations, the reference for create\n');
