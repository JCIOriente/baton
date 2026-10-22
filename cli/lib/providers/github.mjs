import { randomBytes } from 'node:crypto';
import { run, BatonError } from '../util.mjs';
import { activeClaim, claimComment, labelNames, releaseComment } from '../tasks.mjs';

const ISSUE_FIELDS = 'number,title,body,state,assignees,labels,url';

/** GitHub Issues task provider, implemented on top of the `gh` CLI. */
export class GithubProvider {
  constructor(config, root) {
    this.config = config;
    this.labels = config.tasks.labels;
    this.root = root;
    this.repoArgs = config.tasks.repo ? ['--repo', config.tasks.repo] : [];
  }

  gh(args, opts = {}) {
    return run('gh', args, { cwd: this.root, ...opts });
  }

  ghJson(args) {
    const out = this.gh(args).stdout;
    return out ? JSON.parse(out) : null;
  }

  currentUser() {
    if (!this._user) this._user = this.gh(['api', 'user', '-q', '.login']).stdout;
    return this._user;
  }

  list({ state = 'open', label, assignee, limit = 200 } = {}) {
    const args = ['issue', 'list', ...this.repoArgs, '--state', state, '--limit', String(limit), '--json', ISSUE_FIELDS];
    if (label) args.push('--label', label);
    if (assignee) args.push('--assignee', assignee);
    return this.ghJson(args);
  }

  openNumbers() {
    const open = this.ghJson(['issue', 'list', ...this.repoArgs, '--state', 'open', '--limit', '1000', '--json', 'number']);
    return new Set(open.map((i) => i.number));
  }

  get(number, { comments = false } = {}) {
    const fields = comments ? `${ISSUE_FIELDS},comments` : ISSUE_FIELDS;
    return this.ghJson(['issue', 'view', String(number), ...this.repoArgs, '--json', fields]);
  }

  create({ title, body, labels = [], priority }) {
    const all = [...labels];
    if (priority !== undefined) all.push(`${this.labels.priorityPrefix}p${priority}`);
    const args = ['issue', 'create', ...this.repoArgs, '--title', title, '--body', body ?? ''];
    for (const l of all) args.push('--label', l);
    const url = this.gh(args).stdout.split('\n').pop();
    return { url, number: Number(url.split('/').pop()) };
  }

  comment(number, body) {
    this.gh(['issue', 'comment', String(number), ...this.repoArgs, '--body', body]);
  }

  edit(number, { addLabels = [], removeLabels = [], addAssignees = [], removeAssignees = [] }) {
    const args = ['issue', 'edit', String(number), ...this.repoArgs];
    if (addLabels.length) args.push('--add-label', addLabels.join(','));
    if (removeLabels.length) args.push('--remove-label', removeLabels.join(','));
    if (addAssignees.length) args.push('--add-assignee', addAssignees.join(','));
    if (removeAssignees.length) args.push('--remove-assignee', removeAssignees.join(','));
    if (args.length > 3 + this.repoArgs.length) this.gh(args);
  }

  /** Move a task to exactly one status label. */
  setStatus(number, status) {
    const map = { ready: this.labels.ready, 'in-progress': this.labels.inProgress, review: this.labels.review, blocked: this.labels.blocked };
    if (!map[status]) throw new BatonError(`Unknown status '${status}'`);
    const current = labelNames(this.get(number).labels);
    const removeLabels = Object.values(map).filter((l) => l !== map[status] && current.includes(l));
    this.edit(number, { addLabels: [map[status]], removeLabels });
  }

  /**
   * Claim a task. Posts a marker comment, assigns, then re-reads the thread:
   * if an earlier claim exists, this claim loses and is rolled back.
   */
  claim(number) {
    const me = this.currentUser();
    const before = this.get(number, { comments: true });
    if (before.state.toLowerCase() === 'closed') throw new BatonError(`#${number} is closed`);

    const existing = activeClaim(before.comments);
    if (existing?.user === me) return { claimed: true, already: true, task: before };
    if (existing) throw new BatonError(`#${number} is already claimed by @${existing.user}`);
    const others = before.assignees.map((a) => a.login).filter((l) => l !== me);
    if (others.length) throw new BatonError(`#${number} is assigned to @${others.join(', @')}`);

    const nonce = randomBytes(4).toString('hex');
    this.comment(number, claimComment(me, nonce));

    const after = this.get(number, { comments: true });
    const winner = activeClaim(after.comments);
    if (!winner || winner.user !== me || winner.nonce !== nonce) {
      this.comment(number, releaseComment(me, `lost claim race to @${winner?.user ?? 'unknown'}`));
      throw new BatonError(`Lost claim race on #${number} to @${winner?.user ?? 'unknown'}`);
    }
    this.edit(number, {
      addAssignees: [me],
      addLabels: [this.labels.inProgress],
      removeLabels: labelNames(after.labels).filter((l) => l === this.labels.ready || l === this.labels.blocked),
    });
    return { claimed: true, already: false, task: after };
  }

  release(number, { reason = 'released', status = 'ready' } = {}) {
    const me = this.currentUser();
    const task = this.get(number, { comments: true });
    const claim = activeClaim(task.comments);
    if (claim && claim.user !== me) throw new BatonError(`#${number} is claimed by @${claim.user}, not you`);
    this.comment(number, releaseComment(me, reason));
    this.edit(number, { removeAssignees: [me] });
    this.setStatus(number, status);
  }

  /** Create the status/priority labels if missing. Idempotent. */
  ensureLabels() {
    const defs = [
      [this.labels.ready, '0e8a16', 'Ready to be claimed'],
      [this.labels.inProgress, 'fbca04', 'Claimed and being worked on'],
      [this.labels.review, '1d76db', 'PR open, awaiting review'],
      [this.labels.blocked, 'b60205', 'Waiting on a dependency or decision'],
      ...[0, 1, 2, 3].map((p) => [`${this.labels.priorityPrefix}p${p}`, ['d93f0b', 'e99695', 'f9d0c4', 'ededed'][p], `Priority ${p}`]),
    ];
    for (const [name, color, description] of defs) {
      this.gh(['label', 'create', name, ...this.repoArgs, '--color', color, '--description', description, '--force']);
    }
    return defs.map((d) => d[0]);
  }

  openPullRequest({ branch, title, body, base, draft = false }) {
    const args = ['pr', 'create', ...this.repoArgs, '--head', branch, '--base', base, '--title', title, '--body', body];
    if (draft) args.push('--draft');
    return this.gh(args).stdout.split('\n').pop();
  }

  findPullRequest(branch) {
    const prs = this.ghJson(['pr', 'list', ...this.repoArgs, '--head', branch, '--state', 'open', '--json', 'number,url,title']);
    return prs[0] ?? null;
  }
}

export function getProvider(config, root) {
  if (config.tasks.provider === 'github') return new GithubProvider(config, root);
  throw new BatonError(`Unsupported task provider '${config.tasks.provider}'`);
}
