import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();

  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>XibeCode</title>
  <style nonce="${nonce}">
    :root {
      --bg: #0d0d0f;
      --surface: #141418;
      --surface2: #1c1c22;
      --border: rgba(255,255,255,0.07);
      --accent: #7c3aed;
      --accent2: #2563eb;
      --text: #f0f0f0;
      --muted: #6b7280;
      --green: #22c55e;
      --red: #ef4444;
      --user-bg: #1e1b2e;
      --ai-bg: #141418;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, -apple-system, sans-serif);
      font-size: 13px;
      color: var(--text);
      background: var(--bg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      padding: 9px 14px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      gap: 8px;
      background: var(--surface);
    }
    .header-logo {
      font-weight: 800;
      font-size: 13px;
      background: linear-gradient(135deg, #a855f7, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.3px;
    }
    .header-badge {
      font-size: 10px;
      color: var(--muted);
      background: rgba(255,255,255,0.06);
      padding: 2px 7px;
      border-radius: 99px;
      border: 1px solid var(--border);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }
    .header-status {
      margin-left: auto;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--muted);
      flex-shrink: 0;
      transition: background 0.3s;
    }
    .header-status.running { background: var(--green); box-shadow: 0 0 6px var(--green); animation: blink 1.4s infinite; }
    @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.4;} }

    /* ── Messages ── */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .messages::-webkit-scrollbar { width: 4px; }
    .messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

    /* ── Bubbles ── */
    .msg {
      max-width: 92%;
      padding: 10px 13px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.6;
      word-break: break-word;
      animation: fadeUp 0.2s ease;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .msg.user {
      align-self: flex-end;
      background: linear-gradient(135deg, #2d1f5e, #1e2a4a);
      border: 1px solid rgba(124,58,237,0.3);
      color: #f0f0f0;
    }
    .msg.assistant {
      align-self: flex-start;
      background: var(--ai-bg);
      border: 1px solid var(--border);
      color: #e8e8e8;
    }
    .msg.system {
      align-self: center;
      font-size: 11px;
      color: var(--muted);
      font-style: italic;
      background: transparent;
      border: none;
      padding: 2px 0;
    }
    .msg.error {
      align-self: flex-start;
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      color: #fca5a5;
      font-size: 12px;
    }

    /* ── Markdown inside .msg ── */
    .msg h1,.msg h2,.msg h3 { margin: 8px 0 4px; font-weight: 700; color: #fff; }
    .msg h1 { font-size: 16px; }
    .msg h2 { font-size: 14px; }
    .msg h3 { font-size: 13px; }
    .msg p { margin: 4px 0; }
    .msg ul,.msg ol { padding-left: 18px; margin: 4px 0; }
    .msg li { margin: 2px 0; }
    .msg code {
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11.5px;
      color: #c4b5fd;
    }
    .msg pre {
      background: #0a0a0c;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      overflow-x: auto;
      margin: 8px 0;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11.5px;
      line-height: 1.5;
    }
    .msg pre code { background: none; padding: 0; color: #e2e8f0; }
    .msg blockquote {
      border-left: 3px solid var(--accent);
      padding-left: 10px;
      color: var(--muted);
      margin: 6px 0;
    }
    .msg a { color: #818cf8; text-decoration: underline; }
    .msg strong { color: #fff; font-weight: 700; }
    .msg em { color: #c4b5fd; }
    .msg hr { border: none; border-top: 1px solid var(--border); margin: 8px 0; }

    /* ── Tool calls ── */
    .tool-call {
      align-self: flex-start;
      width: 100%;
      font-size: 11.5px;
      border-left: 2px solid var(--accent);
      background: rgba(124,58,237,0.07);
      border-radius: 0 8px 8px 0;
      overflow: hidden;
      animation: fadeUp 0.15s ease;
    }
    .tool-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }
    .tool-header:hover { background: rgba(255,255,255,0.04); }
    .tool-icon { font-size: 12px; }
    .tool-name { font-weight: 700; color: #a78bfa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; flex: 1; }
    .tool-result-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 99px;
      background: rgba(34,197,94,0.15);
      color: var(--green);
      border: 1px solid rgba(34,197,94,0.25);
      display: none;
    }
    .tool-call.done .tool-result-badge { display: inline; }
    .tool-toggle { font-size: 10px; color: var(--muted); transition: transform 0.2s; }
    .tool-call.expanded .tool-toggle { transform: rotate(180deg); }
    .tool-args {
      display: none;
      padding: 0 12px 10px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      color: #9ca3af;
      white-space: pre-wrap;
      border-top: 1px solid rgba(255,255,255,0.05);
      margin-top: 0;
      padding-top: 8px;
      line-height: 1.5;
    }
    .tool-call.expanded .tool-args { display: block; }

    /* ── Streaming ── */
    .streaming-cursor {
      display: inline-block;
      width: 2px;
      height: 14px;
      background: var(--accent);
      border-radius: 1px;
      animation: blink 0.8s infinite;
      vertical-align: text-bottom;
      margin-left: 2px;
    }
    .thinking-badge {
      align-self: flex-start;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--muted);
      padding: 5px 10px;
      background: var(--surface2);
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .thinking-dots span {
      display: inline-block;
      width: 4px; height: 4px;
      border-radius: 50%;
      background: var(--muted);
      margin: 0 1px;
      animation: dotBounce 1.2s infinite;
    }
    .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
    .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dotBounce {
      0%,80%,100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-4px); opacity: 1; }
    }

    /* ── Welcome ── */
    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      flex: 1;
      padding: 30px 20px;
      text-align: center;
    }
    .welcome-logo {
      font-size: 30px;
      background: linear-gradient(135deg, #a855f7, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 900;
      letter-spacing: -1px;
    }
    .welcome p { color: var(--muted); font-size: 12px; line-height: 1.6; max-width: 220px; }
    .welcome-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      margin-top: 4px;
    }
    .chip {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 99px;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border);
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s;
    }
    .chip:hover { background: rgba(124,58,237,0.15); border-color: rgba(124,58,237,0.4); color: #c4b5fd; }

    /* ── Input area ── */
    .input-wrap {
      padding: 10px 12px 12px;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
      background: var(--surface);
    }
    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 8px 10px 8px 14px;
      transition: border-color 0.15s;
    }
    .input-row:focus-within { border-color: rgba(124,58,237,0.5); }
    #input {
      flex: 1;
      resize: none;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 13px;
      line-height: 1.5;
      min-height: 22px;
      max-height: 120px;
    }
    #input::placeholder { color: var(--muted); }
    #input:disabled { opacity: 0.5; }
    #sendBtn {
      flex-shrink: 0;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: all 0.15s;
      background: linear-gradient(135deg, #7c3aed, #2563eb);
      color: #fff;
    }
    #sendBtn:hover { opacity: 0.85; transform: scale(1.05); }
    #sendBtn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    #sendBtn.stop-mode { background: var(--red); }
    .input-hint { font-size: 10px; color: var(--muted); margin-top: 5px; padding: 0 2px; opacity: 0.6; }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-logo">XibeCode</span>
    <span class="header-badge" id="modelBadge">loading…</span>
    <div class="header-status" id="statusDot"></div>
  </div>
  <div class="messages" id="messages">
    <div class="welcome" id="welcome">
      <div class="welcome-logo">XibeCode</div>
      <p>Your AI coding agent.<br/>Ask me to write, fix, or refactor anything.</p>
      <div class="welcome-chips">
        <span class="chip" data-prompt="Explain this file">Explain file</span>
        <span class="chip" data-prompt="Write tests for this code">Write tests</span>
        <span class="chip" data-prompt="Find bugs in this file">Find bugs</span>
        <span class="chip" data-prompt="/help">Commands</span>
      </div>
    </div>
  </div>
  <div class="input-wrap">
    <div class="input-row">
      <textarea id="input" rows="1" placeholder="Ask XibeCode… (/ for commands)"></textarea>
      <button id="sendBtn" title="Send">▶</button>
    </div>
    <div class="input-hint">Enter to send · Shift+Enter for newline · /help for commands</div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const welcomeEl  = document.getElementById('welcome');
    const inputEl    = document.getElementById('input');
    const sendBtn    = document.getElementById('sendBtn');
    const modelBadge = document.getElementById('modelBadge');
    const statusDot  = document.getElementById('statusDot');

    let isRunning   = false;
    let streamingEl = null;
    let thinkingEl  = null;
    let currentToolId = null;

    // ── Send ──
    function send() {
      const text = inputEl.value.trim();
      if (!text || isRunning) return;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      hideWelcome();
      addMessage('user', text);
      vscode.postMessage({ command: 'sendMessage', text });
    }

    sendBtn.addEventListener('click', () => {
      if (isRunning) {
        vscode.postMessage({ command: 'abort' });
        setRunning(false);
      } else {
        send();
      }
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    // ── Chip prompts ──
    messagesEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip[data-prompt]');
      if (chip) { inputEl.value = chip.dataset.prompt; inputEl.focus(); return; }
      const header = e.target.closest('.tool-header');
      if (header) { header.parentElement.classList.toggle('expanded'); }
    });

    // ── Helpers ──
    function hideWelcome() {
      if (welcomeEl) welcomeEl.style.display = 'none';
    }

    function addMessage(role, content, html) {
      hideWelcome();
      removeThinking();
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      if (html) div.innerHTML = html;
      else div.textContent = content;
      messagesEl.appendChild(div);
      scrollEnd();
      return div;
    }

    function addToolCall(name, args) {
      removeThinking();
      const div = document.createElement('div');
      div.className = 'tool-call';
      div.id = 'tc-' + Date.now();
      let h = '<div class="tool-header">';
      h += '<span class="tool-icon">⚙</span>';
      h += '<span class="tool-name">' + escapeHtml(name) + '</span>';
      h += '<span class="tool-result-badge">✓ done</span>';
      h += '<span class="tool-toggle">▼</span></div>';
      if (args) {
        h += '<div class="tool-args">' + escapeHtml(args) + '</div>';
      }
      div.innerHTML = h;
      messagesEl.appendChild(div);
      scrollEnd();
      return div.id;
    }

    function markToolDone(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('done');
    }

    function showThinking() {
      if (thinkingEl) return;
      hideWelcome();
      thinkingEl = document.createElement('div');
      thinkingEl.className = 'thinking-badge';
      thinkingEl.innerHTML = 'Thinking <span class="thinking-dots"><span></span><span></span><span></span></span>';
      messagesEl.appendChild(thinkingEl);
      scrollEnd();
    }

    function removeThinking() {
      if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
    }

    function startStreaming() {
      hideWelcome();
      removeThinking();
      streamingEl = document.createElement('div');
      streamingEl.className = 'msg assistant';
      streamingEl.innerHTML = '<span class="streaming-cursor"></span>';
      messagesEl.appendChild(streamingEl);
      scrollEnd();
    }

    function appendStreaming(text, html) {
      if (!streamingEl) startStreaming();
      const cursor = streamingEl.querySelector('.streaming-cursor');
      if (cursor) cursor.remove();
      if (html) {
        streamingEl.innerHTML = html + '<span class="streaming-cursor"></span>';
      } else {
        streamingEl.textContent += text;
      }
      scrollEnd();
    }

    function endStreaming() {
      if (streamingEl) {
        const cursor = streamingEl.querySelector('.streaming-cursor');
        if (cursor) cursor.remove();
        streamingEl = null;
      }
    }

    function setRunning(val) {
      isRunning = val;
      sendBtn.textContent = val ? '■' : '▶';
      sendBtn.classList.toggle('stop-mode', val);
      sendBtn.title = val ? 'Stop' : 'Send';
      statusDot.classList.toggle('running', val);
      inputEl.disabled = val;
    }

    function scrollEnd() { messagesEl.scrollTop = messagesEl.scrollHeight; }

    function escapeHtml(s) {
      const d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    }

    // ── Message handler ──
    window.addEventListener('message', (ev) => {
      const msg = ev.data;
      switch (msg.type) {

        case 'config':
          modelBadge.textContent = msg.modelLabel || (msg.model || '—');
          break;

        case 'history':
          messagesEl.innerHTML = '';
          if (!msg.messages || msg.messages.length === 0) {
            const wc = makeWelcome();
            messagesEl.appendChild(wc);
          } else {
            for (const m of msg.messages) addMessage(m.role, m.content, m.html);
          }
          break;

        case 'userMessage':
          hideWelcome();
          addMessage('user', msg.text);
          break;

        case 'status':
          setRunning(msg.status === 'running');
          if (msg.status === 'running') showThinking();
          else removeThinking();
          break;

        case 'agentEvent': {
          const ev = msg.event;
          switch (ev.type) {
            case 'stream_start':
              removeThinking();
              startStreaming();
              break;
            case 'stream_text':
              appendStreaming(ev.data?.text || '', ev.data?.html);
              break;
            case 'stream_end':
              endStreaming();
              break;
            case 'response':
              endStreaming();
              addMessage('assistant', ev.data?.text || '', ev.data?.html);
              break;
            case 'tool_call':
              currentToolId = addToolCall(
                ev.data?.name || 'tool',
                ev.data?.arguments || ev.data?.input
                  ? JSON.stringify(ev.data.arguments || ev.data.input, null, 2)
                  : null
              );
              showThinking();
              break;
            case 'tool_result':
              if (currentToolId) { markToolDone(currentToolId); currentToolId = null; }
              removeThinking();
              break;
            case 'thinking':
              showThinking();
              break;
            case 'error':
              removeThinking();
              addMessage('error', '❌ ' + (ev.data?.message || 'An error occurred.'));
              setRunning(false);
              break;
            case 'complete': {
              removeThinking();
              endStreaming();
              const d = ev.data || {};
              const parts = [];
              if (d.iterations) parts.push(d.iterations + ' steps');
              if (d.toolCalls) parts.push(d.toolCalls + ' tools');
              if (d.filesChanged) parts.push(d.filesChanged + ' files changed');
              if (d.costLabel) parts.push(d.costLabel);
              if (parts.length) addMessage('system', '✓ Done — ' + parts.join(' · '));
              setRunning(false);
              break;
            }
          }
          break;
        }
      }
    });

    function makeWelcome() {
      const d = document.createElement('div');
      d.className = 'welcome';
      d.id = 'welcome';
      d.innerHTML = \`
        <div class="welcome-logo">XibeCode</div>
        <p>Your AI coding agent.<br/>Ask me to write, fix, or refactor anything.</p>
        <div class="welcome-chips">
          <span class="chip" data-prompt="Explain this file">Explain file</span>
          <span class="chip" data-prompt="Write tests for this code">Write tests</span>
          <span class="chip" data-prompt="Find bugs in this file">Find bugs</span>
          <span class="chip" data-prompt="/help">Commands</span>
        </div>
      \`;
      return d;
    }

    // ── Init ──
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
