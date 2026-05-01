/**
 * Human-readable one-line summaries for tool calls and results in the chat TUI.
 */

const MAX_ARG = 200;
const MAX_ERR = 240;
/** Max characters of each worker log preview in run_swarm TUI lines */
const RUN_SWARM_PREVIEW = 320;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function joinPaths(paths: unknown, maxShow: number): string | null {
  if (!Array.isArray(paths)) return null;
  const strs = paths.filter((p): p is string => typeof p === 'string');
  if (strs.length === 0) return null;
  const shown = strs.slice(0, maxShow).join(', ');
  const more = strs.length > maxShow ? ` (+${strs.length - maxShow} more)` : '';
  return `${shown}${more}`;
}

/** Arguments / target of a tool (shown right after the tool name). */
export function formatToolArgs(toolName: string, rawInput: unknown): string {
  let input: unknown = rawInput;
  if (typeof input === 'string') {
    const raw = input;
    try {
      input = JSON.parse(raw) as unknown;
    } catch {
      return truncate(raw, MAX_ARG);
    }
  }
  const p = asRecord(input);
  if (!p) return '';

  switch (toolName) {
    case 'read_file': {
      const path = typeof p.path === 'string' ? p.path : '';
      const start = p.start_line;
      const end = p.end_line;
      if (typeof start === 'number' && typeof end === 'number') {
        return truncate(`${path} (lines ${start}–${end})`, MAX_ARG);
      }
      return truncate(path, MAX_ARG);
    }
    case 'read_multiple_files':
      return truncate(joinPaths(p.paths, 4) ?? '', MAX_ARG);
    case 'write_file':
    case 'edit_file':
    case 'edit_lines':
    case 'verified_edit':
    case 'delete_file':
    case 'revert_file':
    case 'insert_at_line':
      return truncate(typeof p.path === 'string' ? p.path : '', MAX_ARG);
    case 'list_directory':
      return truncate(typeof p.path === 'string' ? p.path : '.', MAX_ARG);
    case 'create_directory':
      return truncate(typeof p.path === 'string' ? p.path : '', MAX_ARG);
    case 'move_file': {
      const src = typeof p.source === 'string' ? p.source : '';
      const dest = typeof p.destination === 'string' ? p.destination : '';
      return truncate(`${src} → ${dest}`, MAX_ARG);
    }
    case 'run_command':
      return truncate(typeof p.command === 'string' ? p.command : '', MAX_ARG);
    case 'run_tests':
      return truncate(
        typeof p.command === 'string' && p.command
          ? p.command
          : typeof p.cwd === 'string' && p.cwd
            ? `(cwd: ${p.cwd})`
            : 'auto-detect',
        MAX_ARG,
      );
    case 'search_files': {
      const pat = typeof p.pattern === 'string' ? p.pattern : '';
      const dir = typeof p.path === 'string' ? p.path : '';
      return truncate(dir ? `${pat} in ${dir}` : pat, MAX_ARG);
    }
    case 'grep_code': {
      const pat = typeof p.pattern === 'string' ? p.pattern : '';
      const dir = typeof p.path === 'string' ? p.path : '';
      return truncate(dir ? `${pat} in ${dir}` : pat, MAX_ARG);
    }
    case 'get_context':
      return truncate(joinPaths(p.files, 5) ?? '', MAX_ARG);
    case 'web_search':
      return truncate(typeof p.query === 'string' ? p.query : '', MAX_ARG);
    case 'fetch_url':
      return truncate(typeof p.url === 'string' ? p.url : '', MAX_ARG);
    case 'git_show_diff':
    case 'git_blame_ai': {
      const fp = typeof p.file_path === 'string' ? p.file_path : typeof p.path === 'string' ? p.path : '';
      return truncate(fp, MAX_ARG);
    }
    case 'git_commit':
      return truncate(typeof p.message === 'string' ? p.message : '', MAX_ARG);
    case 'create_git_checkpoint':
      return truncate(typeof p.message === 'string' ? p.message : '', MAX_ARG);
    case 'revert_to_git_checkpoint':
      return truncate(typeof p.checkpoint_id === 'string' ? p.checkpoint_id : '', MAX_ARG);
    case 'delegate_subtask':
      return truncate(
        typeof p.task === 'string' ? p.task : typeof p.prompt === 'string' ? p.prompt : '',
        MAX_ARG,
      );
    case 'run_swarm': {
      const st = p.subtasks;
      if (!Array.isArray(st) || st.length === 0) return '';
      const modes = st.map((item: unknown) => {
        const o = asRecord(item);
        return o && typeof o.worker_type === 'string' ? o.worker_type : '?';
      });
      const modeStr = modes.join('+');
      const snippets = st
        .slice(0, 2)
        .map((item: unknown) => {
          const o = asRecord(item);
          const t = o && typeof o.task === 'string' ? o.task : '';
          return truncate(t.replace(/\s+/g, ' ').trim(), 72);
        })
        .filter((s: string) => s.length > 0);
      const more = st.length > 2 ? ` (+${st.length - 2} more)` : '';
      const hint = snippets.length ? ` — ${snippets.join(' │ ')}${more}` : '';
      return truncate(`${st.length} workers [${modeStr}]${hint}`, MAX_ARG);
    }
    default: {
      try {
        const json = JSON.stringify(p);
        return truncate(json === '{}' ? '' : json, MAX_ARG);
      } catch {
        return '';
      }
    }
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tok`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tok`;
  return `${n} tok`;
}

/**
 * One line per finished swarm worker (for TUI transcript after run_swarm).
 * Log text is whitespace-collapsed and truncated for readability.
 */
export function formatRunSwarmDetailLines(rawResult: unknown): string[] {
  const r = asRecord(rawResult);
  if (!r || !Array.isArray(r.results)) return [];
  const lines: string[] = [];
  const results = r.results as unknown[];
  for (let i = 0; i < results.length; i++) {
    const row = asRecord(results[i]);
    if (!row) {
      lines.push(`  [${i + 1}] ?`);
      continue;
    }
    const w = typeof row.worker_type === 'string' ? row.worker_type : '?';
    const st = typeof row.status === 'string' ? row.status : '?';
    const ok = row.success === true ? 'ok' : 'fail';
    const tid = typeof row.taskId === 'string' && row.taskId ? row.taskId : '';
    let body = typeof row.result === 'string' ? row.result : '';
    body = truncate(body.replace(/\s+/g, ' ').trim(), RUN_SWARM_PREVIEW);
    const idPart = tid ? ` id=${tid}` : '';
    lines.push(`  [${i + 1}] ${w}${idPart} · ${st} · ${ok}${body ? ` — ${body}` : ''}`);
  }
  return lines;
}

/** Short outcome after a tool finishes (second line in TUI). */
export function formatToolOutcome(toolName: string, rawResult: unknown, success: boolean): string {
  const r = asRecord(rawResult);
  if (!success || r?.error === true || r?.success === false) {
    const msg =
      (r && typeof r.message === 'string' && r.message) ||
      (r && typeof r.error === 'string' && r.error) ||
      'failed';
    return truncate(msg, MAX_ERR);
  }

  if (!r) {
    return 'ok';
  }

  switch (toolName) {
    case 'read_file': {
      const lines = typeof r.lines === 'number' ? r.lines : undefined;
      const total = typeof r.total_lines === 'number' ? r.total_lines : undefined;
      const partial = r.partial === true;
      const parts: string[] = [];
      if (lines !== undefined) parts.push(`${lines} line${lines === 1 ? '' : 's'}${partial ? ' (partial)' : ''}`);
      if (total !== undefined && partial) parts.push(`${total} total in file`);
      if (typeof r.size === 'number') parts.push(`${(r.size / 1024).toFixed(1)} KB`);
      return parts.length > 0 ? parts.join(' · ') : 'read';
    }
    case 'read_multiple_files': {
      const files = Array.isArray(r.files) ? r.files.length : 0;
      const errs = Array.isArray(r.errors) ? r.errors.length : 0;
      if (errs > 0) return `${files} file(s) read, ${errs} error(s)`;
      return `${files} file(s) read`;
    }
    case 'write_file':
    case 'edit_file':
    case 'edit_lines':
    case 'verified_edit':
      if (typeof r.lines === 'number') return `${r.lines} line(s)`;
      if (typeof r.linesChanged === 'number') return `${r.linesChanged} line(s) changed`;
      if (r.dryRun === true) return 'dry run';
      return 'ok';
    case 'list_directory':
      return `${typeof r.count === 'number' ? r.count : 0} item(s)`;
    case 'search_files':
      return `${typeof r.count === 'number' ? r.count : 0} match(es)`;
    case 'grep_code':
      return `${typeof r.match_count === 'number' ? r.match_count : 0} match(es)`;
    case 'run_command':
    case 'run_tests': {
      const code = r.exitCode;
      const ok = r.success !== false;
      const timedOut = r.timedOut === true;
      const tail =
        typeof r.stdout === 'string' && r.stdout
          ? truncate(r.stdout.split('\n')[0] ?? '', 80)
          : '';
      const err1 =
        typeof r.stderr === 'string' && r.stderr && !ok
          ? truncate(r.stderr.split('\n')[0] ?? '', 80)
          : '';
      const codeStr =
        code !== undefined && code !== null && String(code) !== 'null' ? `exit ${String(code)}` : '';
      const status = timedOut ? 'timed out' : ok ? 'done' : 'failed';
      return truncate([status, codeStr, tail || err1].filter(Boolean).join(' · '), MAX_ERR);
    }
    case 'get_context': {
      const n = typeof r.totalFiles === 'number' ? r.totalFiles : Array.isArray(r.files) ? r.files.length : 0;
      const tok = typeof r.estimatedTokens === 'number' ? ` · ~${formatTokens(r.estimatedTokens)}` : '';
      return `${n} file(s) in context${tok}`;
    }
    case 'web_search': {
      const n = Array.isArray(r.results) ? r.results.length : 0;
      return n > 0 ? `${n} result(s)` : 'done';
    }
    case 'fetch_url': {
      const c = r.content;
      if (typeof c === 'string') return `${(c.length / 1024).toFixed(1)} KB`;
      return 'fetched';
    }
    case 'move_file':
    case 'delete_file':
    case 'create_directory':
    case 'revert_file':
      return 'ok';
    case 'delegate_subtask':
      return typeof r.status === 'string' ? r.status : 'done';
    case 'run_swarm': {
      const results = Array.isArray(r.results) ? r.results : [];
      const nOk = results.filter((x) => asRecord(x)?.success === true).length;
      return `${nOk}/${results.length} worker(s) ok`;
    }
    default:
      return 'ok';
  }
}
