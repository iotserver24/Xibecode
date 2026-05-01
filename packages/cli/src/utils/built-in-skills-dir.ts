import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the built-in skills directory relative to this module.
 * This file lives at dist/utils/built-in-skills-dir.js, so
 * ../../skills points to packages/cli/skills/.
 */
export const builtInSkillsDir = path.join(__dirname, '..', '..', 'skills');
