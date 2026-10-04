// Gera server/panel-ui.mjs a partir de panel-src/panel.js (o painel fica FORA da pasta pública e só é entregue após o login).
import { readFileSync, writeFileSync } from 'node:fs';
const code = readFileSync(new URL('../panel-src/panel.js', import.meta.url), 'utf8');
writeFileSync(new URL('../server/panel-ui.mjs', import.meta.url), 'export const PANEL_JS = ' + JSON.stringify(code) + ';\n');
console.log('server/panel-ui.mjs gerado');
