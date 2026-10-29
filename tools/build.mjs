/**
 * `yarn build`: the published package. Two bundles (the CLI and the API), the declarations, and
 * the part of the reference that `clean-ddd create` copies when it runs from an installed
 * package rather than from a checkout — the building blocks, the shared kernel's model, the
 * configuration and the contract, laid out as the repository is, so `create` reads them the
 * same way. ESLint is never bundled: the import rules are asked of the language's own linter.
 */
import { execFileSync } from 'child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
writeFileSync(join(dist, 'cli.js'), `#!/usr/bin/env node\n${readFileSync(join(dist, 'cli.js'), 'utf8')}`);
chmodSync(join(dist, 'cli.js'), 0o755);

execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', 'tools/tsconfig.build.json'], { cwd: root, stdio: 'inherit' });

// What `create` copies, per language, as each binding's `create` section lists it, plus what
// `create` reads: the contract, the concepts, the bindings, each language's manifest, the root
// package (for the version) and what every language shares (.claude, .editorconfig).
const yaml = (await import('js-yaml')).load;
const reference = join(dist, 'reference');
const copyInto = path => {
  const to = join(reference, path);
  mkdirSync(dirname(to), { recursive: true });
  // What a working checkout builds beside the sources (caches, build output) is not the reference.
  cpSync(join(root, path), to, {
    recursive: true,
    filter: source =>
      !/(^|\/)(__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|node_modules|target|\.venv)(\/|$)/.test(source),
  });
};
const contract = yaml(readFileSync(join(root, 'conventions/architecture.yaml'), 'utf8'));
for (const path of [
  'conventions/architecture.yaml',
  'conventions/concepts.yaml',
  'conventions/domain.yaml',
  '.claude',
  '.editorconfig',
  'package.json',
])
  copyInto(path);
for (const language of contract.languages) {
  const binding = yaml(readFileSync(join(root, `conventions/${language}.yaml`), 'utf8'));
  copyInto(`conventions/${language}.yaml`);
  if (!binding.create) continue;
  for (const entry of [...binding.create.copy, binding.create.manifest]) {
    copyInto(join(binding.root, typeof entry === 'string' ? entry : entry.from));
  }
  // The contexts a created application starts with keep their description in the map and, where the
  // language's tool commits one, their lines of the inventory.
  if (binding.create.inventory) copyInto(`docs/inventory/${language}.json`);
}
process.stdout.write('✓ tools/dist: cli.js, index.js, the declarations, the reference for create\n');
