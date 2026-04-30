import { mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.join(__dirname, '..');
const sourceFixture = path.join(packageRoot, 'src', 'fixtures', 'prompt-library.yml');
const destinationDir = path.join(packageRoot, 'dist', 'fixtures');
const destinationFixture = path.join(destinationDir, 'prompt-library.yml');

mkdirSync(destinationDir, { recursive: true });
copyFileSync(sourceFixture, destinationFixture);
