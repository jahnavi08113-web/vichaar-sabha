import { spawnSync } from 'node:child_process';

const pyCheck = spawnSync('python3', ['--version'], { stdio: 'ignore' });
if (pyCheck.error || pyCheck.status !== 0) {
  console.log('Skipping skill tests: python3 not found on PATH.');
  process.exit(0);
}

const bashCheck = spawnSync('bash', ['--version'], { stdio: 'ignore' });
if (bashCheck.error || bashCheck.status !== 0) {
  console.log('Skipping skill tests: bash not found on PATH.');
  process.exit(0);
}

const res = spawnSync('bash', ['skills/paksh-advocate/tests/run_tests.sh'], { stdio: 'inherit' });
process.exit(res.status ?? 1);
