import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'assets', 'figma');
const BASE = 'https://www.figma.com/api/mcp/asset/';

const ASSETS = {
  'hero-illustration.png': '36f68d63-194e-41f3-bf5f-a0752f0e0561.png',
  'login-wave-left.svg': 'd87c53a5-ab4b-414f-bf41-f9a8e3c9d538.svg',
  'login-wave-right.svg': '00b467c2-5c3b-4c02-8ff8-f1e96c547115.svg',
  'icon-success.svg': 'f1e5d406-6623-4e27-ada1-9b034f97ea98.svg',
  'icon-confirm-file.svg': 'fef988a2-d457-43c9-b7e9-d31b0ac034b4.svg',
  'icon-logout.svg': '835d6ae7-fc94-4bd8-b8b5-89086af5a707.svg',
  'icon-power.svg': '761baeae-79db-4a85-a17b-18ae61f7c9bf.svg',
  'mock-gel-pen.png': '86ad3b25-9178-41c5-b007-a571b10bb2d6.png',
  'mock-a4-paper.png': 'd14622ac-5a3b-4756-ba51-0fcdf81e37f6.png',
  'mock-black-marker.png': '874cc066-f7a9-4b03-b1bb-8feca7c24ed7.png',
  'mock-standard-pen.png': '0c372ecc-213b-467b-b363-efc629a9b9b0.png',
};

const MOCK_OUT = join(ROOT, 'public', 'mock');
await mkdir(OUT, { recursive: true });
await mkdir(MOCK_OUT, { recursive: true });

const destinationOf = (fileName) =>
  fileName.startsWith('mock-') ? join(MOCK_OUT, fileName.slice('mock-'.length)) : join(OUT, fileName);

const results = await Promise.allSettled(
  Object.entries(ASSETS).map(async ([fileName, id]) => {
    const response = await fetch(BASE + id);
    if (!response.ok) throw new Error(`${fileName}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error(`${fileName}: empty response`);
    await writeFile(destinationOf(fileName), bytes);
    return `${fileName} (${bytes.length} B)`;
  }),
);

let failed = 0;
for (const result of results) {
  if (result.status === 'fulfilled') console.log('✓', result.value);
  else {
    failed += 1;
    console.error('✗', result.reason instanceof Error ? result.reason.message : result.reason);
  }
}
if (failed > 0) {
  console.error(`\n${failed} asset(s) failed. Re-export them from Figma (URLs expire after 7 days).`);
  process.exit(1);
}
