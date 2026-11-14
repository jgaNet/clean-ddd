/**
 * The query of RFC 0006 (K3) as a bundle of its own, `tools/dist/knowledge.js`: what a tree whose own tooling is older
 * runs beside it, without replacing it — `node <path>/knowledge.js <name> [--json] --root <tree>`.
 */
import { runKnowledge } from './knowledge';

process.exitCode = runKnowledge(process.argv.slice(2), process.cwd(), text => process.stdout.write(text));
