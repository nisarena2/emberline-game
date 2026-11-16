// main.ts — hands EMBERLINE in: copies game/ and screenshots/ to the output
// directory and writes dossier.json with buildDossier from the kit's vendor
// library. Node 22, standard library only.
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(root, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = await buildDossier(out, { text_max_bytes: 163840 });
writeFileSync(join(out, 'dossier.json'), dossier);
