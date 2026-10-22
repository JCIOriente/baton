import { spawnSync } from 'node:child_process';

export class BatonError extends Error {
  constructor(message, { exitCode = 1, hint } = {}) {
    super(message);
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

/** Run a command synchronously. Throws BatonError on non-zero exit unless `allowFail`. */
export function run(cmd, args, { cwd, input, allowFail = false, inherit = false } = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    input,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) {
    if (res.error.code === 'ENOENT') {
      throw new BatonError(`'${cmd}' not found on PATH`, { hint: `Install ${cmd} and retry.` });
    }
    throw res.error;
  }
  const out = { code: res.status, stdout: (res.stdout ?? '').trim(), stderr: (res.stderr ?? '').trim() };
  if (out.code !== 0 && !allowFail) {
    throw new BatonError(`${cmd} ${args.join(' ')} failed (exit ${out.code})\n${out.stderr || out.stdout}`);
  }
  return out;
}

/** Run a shell command line (used for project-defined validation commands). */
export function runShell(line, { cwd, stdout = 'inherit' } = {}) {
  // stdout: 'stderr' keeps step output off our stdout so --json output stays parseable.
  const out = stdout === 'stderr' ? process.stderr.fd : 'inherit';
  const res = spawnSync(line, { cwd, shell: true, stdio: ['inherit', out, 'inherit'] });
  return res.status ?? 1;
}

export function slugify(text, max = 40) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge: objects merge recursively, arrays and scalars from `override` replace `base`. */
export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

export function print(obj, { json = false } = {}) {
  if (json || typeof obj !== 'string') process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  else process.stdout.write(obj + '\n');
}
