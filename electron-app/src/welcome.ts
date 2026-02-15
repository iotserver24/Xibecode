// ---------------------------------------------------------------------------
// Welcome renderer – runs in the BrowserWindow (with preload bridge)
// ---------------------------------------------------------------------------
export {};

interface XibecodeAPI {
  openFolder(): Promise<string | null>;
  openRecent(path: string): Promise<boolean>;
  getRecentProjects(): Promise<
    { path: string; name: string; lastOpened: string; pinned?: boolean }[]
  >;
  cloneRepo(url: string, dest: string): Promise<{ success: boolean; error?: string }>;
  newProject(name: string): Promise<string | null>;
  getCliVersion(): Promise<string | null>;
  removeRecent(path: string): Promise<boolean>;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    xibecode: XibecodeAPI;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const $recentList = document.getElementById('recent-list')!;
const $cliStatus = document.getElementById('cli-status')!;
const $btnOpen = document.getElementById('btn-open')!;
const $btnClone = document.getElementById('btn-clone')!;
const $btnNew = document.getElementById('btn-new')!;

// Clone dialog
const $cloneDialog = document.getElementById('clone-dialog')!;
const $cloneUrl = document.getElementById('clone-url') as HTMLInputElement;
const $cloneDest = document.getElementById('clone-dest') as HTMLInputElement;
const $cloneCancel = document.getElementById('clone-cancel')!;
const $cloneConfirm = document.getElementById('clone-confirm')!;

// New-project dialog
const $newDialog = document.getElementById('new-dialog')!;
const $newName = document.getElementById('new-name') as HTMLInputElement;
const $newCancel = document.getElementById('new-cancel')!;
const $newConfirm = document.getElementById('new-confirm')!;

// ---------------------------------------------------------------------------
// Render recent projects
// ---------------------------------------------------------------------------

async function renderRecent(): Promise<void> {
  const projects = await window.xibecode.getRecentProjects();

  if (projects.length === 0) {
    $recentList.innerHTML = '<li class="empty">No recent projects</li>';
    return;
  }

  // Pinned first, then by date
  const sorted = [...projects].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
  });

  $recentList.innerHTML = sorted
    .map(
      (p) => `
    <li data-path="${p.path}">
      <span class="recent-name">${p.pinned ? '📌 ' : ''}${p.name}</span>
      <span class="recent-path">${p.path}</span>
      <span class="recent-time">${relativeTime(p.lastOpened)}</span>
      <button class="recent-remove" data-remove="${p.path}">Remove</button>
    </li>`,
    )
    .join('');

  // Click to open
  $recentList.querySelectorAll('li[data-path]').forEach((li) => {
    li.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('recent-remove')) return;
      const folder = (li as HTMLElement).dataset.path!;
      window.xibecode.openRecent(folder);
    });
  });

  // Remove button
  $recentList.querySelectorAll('.recent-remove').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folder = (btn as HTMLElement).dataset.remove!;
      await window.xibecode.removeRecent(folder);
      renderRecent();
    });
  });
}

// ---------------------------------------------------------------------------
// CLI status
// ---------------------------------------------------------------------------

async function checkCli(): Promise<void> {
  const version = await window.xibecode.getCliVersion();
  if (version) {
    $cliStatus.textContent = `xibecode ${version} installed`;
    $cliStatus.classList.remove('error');
  } else {
    $cliStatus.textContent = 'xibecode not found — install with: npm i -g xibecode';
    $cliStatus.classList.add('error');
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

$btnOpen.addEventListener('click', () => window.xibecode.openFolder());

$btnClone.addEventListener('click', () => {
  $cloneUrl.value = '';
  $cloneDest.value = '';
  $cloneDialog.classList.remove('hidden');
  $cloneUrl.focus();
});

$cloneCancel.addEventListener('click', () => $cloneDialog.classList.add('hidden'));
$cloneConfirm.addEventListener('click', async () => {
  const url = $cloneUrl.value.trim();
  const dest = $cloneDest.value.trim();
  if (!url || !dest) return;
  $cloneDialog.classList.add('hidden');
  const result = await window.xibecode.cloneRepo(url, dest);
  if (!result.success) {
    alert(`Clone failed: ${result.error}`);
  }
});

$btnNew.addEventListener('click', () => {
  $newName.value = '';
  $newDialog.classList.remove('hidden');
  $newName.focus();
});

$newCancel.addEventListener('click', () => $newDialog.classList.add('hidden'));
$newConfirm.addEventListener('click', async () => {
  const name = $newName.value.trim();
  if (!name) return;
  $newDialog.classList.add('hidden');
  await window.xibecode.newProject(name);
});

// Close dialogs on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $cloneDialog.classList.add('hidden');
    $newDialog.classList.add('hidden');
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderRecent();
checkCli();
