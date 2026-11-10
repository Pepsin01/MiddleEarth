/**
 * Runs the tests (vitest).
 *
 * Why not call vitest directly? On Windows some terminals (for example the ones
 * VS Code opens) spell the working folder with a lowercase drive letter
 * ("c:\Users\..."), and vitest then fails with "failed to find the runner".
 * This wrapper restarts it from the properly spelled path.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const cwd = fs.realpathSync.native(process.cwd());
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);
