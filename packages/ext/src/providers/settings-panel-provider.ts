import * as vscode from 'vscode';
import {
  readConfig, writeConfig, clearConfig, maskApiKey,
  listProfiles, getActiveProfile, setDefaultProfile,
  type XibeCodeConfig,
} from '../services/xibecode-config-service';
import { PROVIDER_CONFIGS } from 'xibecode-core';

export class SettingsPanelProvider {
  private panel?: vscode.WebviewPanel;

  constructor(private readonly extensionUri: vscode.Uri) {}

  open(): void {
    if (this.panel) { this.panel.reveal(); return; }

    this.panel = vscode.window.createWebviewPanel(
      'xibecode.settings',
      'XibeCode Settings',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage((msg) => {
      switch (msg.command) {
        case 'getConfig': {
          const profile = getActiveProfile();
          const cfg = readConfig(profile);
          const profiles = listProfiles();
          this.panel?.webview.postMessage({
            type: 'config',
            config: { ...cfg, apiKeyMasked: cfg.apiKey ? maskApiKey(cfg.apiKey) : '' },
            profile,
            profiles,
          });
          break;
        }
        case 'save': {
          const updates: Partial<XibeCodeConfig> = msg.config;
          writeConfig(updates, msg.profile);
          // Also sync to VS Code settings for compatibility
          const vsCfg = vscode.workspace.getConfiguration('xibecode');
          if (updates.apiKey) vsCfg.update('apiKey', updates.apiKey, vscode.ConfigurationTarget.Global);
          if (updates.model) vsCfg.update('model', updates.model, vscode.ConfigurationTarget.Global);
          if (updates.provider) vsCfg.update('provider', updates.provider, vscode.ConfigurationTarget.Global);
          if (updates.baseUrl) vsCfg.update('baseUrl', updates.baseUrl, vscode.ConfigurationTarget.Global);
          if (updates.maxIterations) vsCfg.update('maxIterations', updates.maxIterations, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage('XibeCode: Settings saved!');
          break;
        }
        case 'clearApiKey': {
          const cfg = readConfig(msg.profile);
          delete cfg.apiKey;
          writeConfig(cfg, msg.profile);
          const vsCfg = vscode.workspace.getConfiguration('xibecode');
          vsCfg.update('apiKey', '', vscode.ConfigurationTarget.Global);
          this.panel?.webview.postMessage({ type: 'clearedKey' });
          vscode.window.showInformationMessage('XibeCode: API key cleared.');
          break;
        }
        case 'resetAll': {
          clearConfig(msg.profile);
          vscode.window.showInformationMessage('XibeCode: Config reset to defaults.');
          this.panel?.webview.postMessage({ type: 'resetDone' });
          break;
        }
        case 'switchProfile': {
          setDefaultProfile(msg.profile);
          const cfg = readConfig(msg.profile);
          const profiles = listProfiles();
          this.panel?.webview.postMessage({
            type: 'config',
            config: { ...cfg, apiKeyMasked: cfg.apiKey ? maskApiKey(cfg.apiKey) : '' },
            profile: msg.profile,
            profiles,
          });
          break;
        }
        case 'fetchModels': {
          this.fetchModels(msg.baseUrl, msg.apiKey, msg.provider);
          break;
        }
        case 'getDefaultBaseUrl': {
          const provider = msg.provider as string;
          const pCfg = (PROVIDER_CONFIGS as Record<string, { baseUrl: string }>)[provider];
          this.panel?.webview.postMessage({
            type: 'defaultBaseUrl',
            baseUrl: pCfg?.baseUrl || '',
          });
          break;
        }
      }
    });

    this.panel.onDidDispose(() => { this.panel = undefined; });
  }

  private async fetchModels(baseUrl: string, apiKey: string, provider?: string): Promise<void> {
    // If no base URL provided, use the provider default
    let url = baseUrl;
    if (!url && provider) {
      const pCfg = (PROVIDER_CONFIGS as Record<string, { baseUrl: string }>)[provider];
      if (pCfg) url = pCfg.baseUrl;
    }
    if (!url) {
      this.panel?.webview.postMessage({ type: 'modelsError', message: 'No base URL available. Set a provider or custom base URL.' });
      return;
    }

    try {
      const fullUrl = url.replace(/\/+$/, '') + '/models';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const res = await fetch(fullUrl, { headers });
      if (!res.ok) throw new Error(`GET /models → ${res.status}`);
      const json = await res.json() as { data?: { id?: string }[] };
      const models = (json.data ?? []).map((m) => m.id ?? '').filter(Boolean).sort();
      this.panel?.webview.postMessage({ type: 'models', models });
    } catch (err: any) {
      this.panel?.webview.postMessage({ type: 'modelsError', message: err.message });
    }
  }

  private buildHtml(): string {
    const nonce = Array.from({ length: 32 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
        Math.floor(Math.random() * 62)
      ]).join('');

    return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"/>
  <title>XibeCode Settings</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:var(--vscode-font-family);
      font-size:var(--vscode-font-size);
      color:var(--vscode-editor-foreground);
      background:var(--vscode-editor-background);
      padding:24px;
      max-width:720px;
      margin:0 auto;
    }
    h1{
      font-size:20px;font-weight:700;margin-bottom:4px;
      background:linear-gradient(135deg,#7c3aed,#2563eb);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;
    }
    .subtitle{color:var(--vscode-descriptionForeground);font-size:12px;margin-bottom:28px;}
    .section{margin-bottom:28px;}
    .section-title{
      font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
      color:var(--vscode-descriptionForeground);
      border-bottom:1px solid var(--vscode-panel-border);
      padding-bottom:6px;margin-bottom:14px;
    }
    .field{margin-bottom:14px;}
    label{display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--vscode-editor-foreground);}
    .hint{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px;}
    input,select,textarea{
      width:100%;
      font-family:var(--vscode-font-family);
      font-size:13px;
      background:var(--vscode-input-background);
      color:var(--vscode-input-foreground);
      border:1px solid var(--vscode-input-border);
      border-radius:6px;padding:7px 10px;outline:none;
      transition:border-color .15s;
    }
    input:focus,select:focus{border-color:var(--vscode-focusBorder);}
    .input-row{display:flex;gap:6px;}
    .input-row input{flex:1;}
    .btn{
      background:var(--vscode-button-background);
      color:var(--vscode-button-foreground);
      border:none;border-radius:6px;
      padding:7px 16px;font-size:13px;font-weight:600;
      cursor:pointer;transition:background .15s;white-space:nowrap;
    }
    .btn:hover{background:var(--vscode-button-hoverBackground);}
    .btn.secondary{
      background:var(--vscode-button-secondaryBackground);
      color:var(--vscode-button-secondaryForeground);
    }
    .btn.secondary:hover{background:var(--vscode-button-secondaryHoverBackground);}
    .btn.danger{background:#c0392b;color:#fff;}
    .btn.danger:hover{background:#a93226;}
    .btn.small{padding:4px 10px;font-size:11px;}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
    .row{display:flex;gap:10px;align-items:flex-end;}
    .row .field{flex:1;}
    select option{background:var(--vscode-dropdown-background);}
    .toast{
      position:fixed;bottom:20px;right:20px;
      background:var(--vscode-notificationCenterHeader-background);
      color:var(--vscode-notifications-foreground);
      border-radius:8px;padding:10px 18px;
      font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.3);
      opacity:0;transition:opacity .3s;pointer-events:none;z-index:100;
    }
    .toast.show{opacity:1;}
    .masked-key{
      font-family:var(--vscode-editor-font-family);
      font-size:12px;color:var(--vscode-descriptionForeground);
      margin-top:4px;
    }
    .profile-badge{
      display:inline-block;
      background:linear-gradient(135deg,#7c3aed33,#2563eb33);
      border:1px solid #7c3aed55;
      border-radius:4px;padding:2px 8px;font-size:11px;
      color:var(--vscode-editor-foreground);margin-left:8px;
    }
    .model-list{
      max-height:180px;overflow-y:auto;
      background:var(--vscode-dropdown-background);
      border:1px solid var(--vscode-input-border);
      border-radius:6px;margin-top:4px;display:none;
    }
    .model-list.visible{display:block;}
    .model-item{
      padding:6px 10px;font-size:12px;cursor:pointer;
      border-bottom:1px solid var(--vscode-panel-border);
    }
    .model-item:hover{background:var(--vscode-list-hoverBackground);}
    .model-item:last-child{border-bottom:none;}
    .status{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;}
  </style>
</head>
<body>
  <h1>XibeCode Settings</h1>
  <p class="subtitle">Configure the XibeCode AI agent — mirrors <code>xibecode config</code></p>

  <!-- Profile -->
  <div class="section">
    <div class="section-title">Profile <span class="profile-badge" id="activeBadge">default</span></div>
    <div class="row">
      <div class="field">
        <label>Active Profile</label>
        <select id="profileSelect"></select>
        <p class="hint">Profiles let you store different API keys / models per project.</p>
      </div>
      <button class="btn secondary" onclick="switchProfile()">Switch</button>
    </div>
  </div>

  <!-- API Key -->
  <div class="section">
    <div class="section-title">API Key</div>
    <div class="field">
      <label>API Key (Bearer token)</label>
      <div class="input-row">
        <input type="password" id="apiKey" placeholder="sk-ant-... or sk-..."/>
        <button class="btn small secondary" onclick="toggleKeyVis()">Show</button>
      </div>
      <p class="masked-key" id="maskedKey"></p>
      <p class="hint">Stored in ~/.xibecode/profile-*.json — same as <code>xibecode config --set-key</code></p>
    </div>
    <div class="actions">
      <button class="btn danger small" onclick="clearKey()">Clear API Key</button>
    </div>
  </div>

  <!-- Provider & Endpoint -->
  <div class="section">
    <div class="section-title">Provider & Endpoint</div>
    <div class="row">
      <div class="field">
        <label>Provider</label>
        <select id="provider">
          <option value="">auto-detect</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="routingrun">Routing.run</option>
          <option value="zenllm">zenllm.org</option>
          <option value="zai">Zhipu AI (z.ai)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="alibaba">Alibaba (Qwen)</option>
          <option value="kimi">Moonshot (Kimi)</option>
          <option value="grok">Grok (xAI)</option>
          <option value="deepseek">DeepSeek</option>
          <option value="openrouter">OpenRouter</option>
          <option value="google">Google (Gemini)</option>
          <option value="groq">Groq</option>
        </select>
      </div>
      <div class="field">
        <label>Base URL <span style="font-weight:400;color:var(--vscode-descriptionForeground)">(optional)</span></label>
        <input type="url" id="baseUrl" placeholder="Auto-detected from provider"/>
      </div>
    </div>
    <div class="actions">
      <button class="btn small secondary" onclick="fetchModels()">Fetch models from provider</button>
      <span class="status" id="fetchStatus"></span>
    </div>
  </div>

  <!-- Model -->
  <div class="section">
    <div class="section-title">Model</div>
    <div class="field">
      <label>Default Model</label>
      <div class="input-row">
        <input type="text" id="model" placeholder="claude-sonnet-4-6"/>
        <button class="btn small secondary" onclick="toggleModelList()">List ▾</button>
      </div>
      <div class="model-list" id="modelList"></div>
      <p class="hint">Model ID used by the agent. Type manually or fetch from your endpoint above.</p>
    </div>
    <div class="row">
      <div class="field">
        <label>Planning Model <span style="font-weight:400;color:var(--vscode-descriptionForeground)">(optional)</span></label>
        <input type="text" id="planningModel" placeholder="Same as default"/>
        <p class="hint">Used for plan/strategy steps when multi-model routing is enabled.</p>
      </div>
      <div class="field">
        <label>Execution Model <span style="font-weight:400;color:var(--vscode-descriptionForeground)">(optional)</span></label>
        <input type="text" id="executionModel" placeholder="Same as default"/>
        <p class="hint">Used for code-writing steps.</p>
      </div>
    </div>
  </div>

  <!-- Cost / Economy Mode -->
  <div class="section">
    <div class="section-title">Cost Mode</div>
    <div class="row">
      <div class="field">
        <label>Mode</label>
        <select id="costMode">
          <option value="normal">normal — full power</option>
          <option value="economy">economy — cheaper model, lower caps</option>
        </select>
      </div>
      <div class="field">
        <label>Economy Model</label>
        <input type="text" id="economyModel" placeholder="e.g. claude-haiku-4-5-20251001"/>
      </div>
    </div>
    <div class="field">
      <label>Economy Max Iterations</label>
      <input type="number" id="economyMaxIterations" min="1" max="500" style="max-width:120px"/>
    </div>
  </div>

  <!-- Agent -->
  <div class="section">
    <div class="section-title">Agent</div>
    <div class="row">
      <div class="field">
        <label>Max Iterations</label>
        <input type="number" id="maxIterations" min="1" max="500" style="max-width:120px"/>
        <p class="hint">Same as <code>-d</code> flag on <code>xibecode run</code>.</p>
      </div>
      <div class="field">
        <label>Package Manager</label>
        <select id="preferredPackageManager">
          <option value="pnpm">pnpm (recommended)</option>
          <option value="bun">bun</option>
          <option value="npm">npm</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Test Command Override <span style="font-weight:400;color:var(--vscode-descriptionForeground)">(optional)</span></label>
      <input type="text" id="testCommandOverride" placeholder="e.g. pnpm test"/>
      <p class="hint">Overrides the auto-detected test command used after code changes.</p>
    </div>
    <div class="field" style="display:flex;align-items:center;gap:10px;margin-top:4px;">
      <input type="checkbox" id="showThinking" style="width:auto;"/>
      <label for="showThinking" style="margin:0;cursor:pointer;">Show agent thinking steps</label>
    </div>
    <div class="field" style="display:flex;align-items:center;gap:10px;margin-top:8px;">
      <input type="checkbox" id="defaultVerbose" style="width:auto;"/>
      <label for="defaultVerbose" style="margin:0;cursor:pointer;">Verbose output by default</label>
    </div>
  </div>

  <!-- Danger Zone -->
  <div class="section">
    <div class="section-title">Danger Zone</div>
    <p class="hint" style="margin-bottom:10px;">This resets the active profile config to defaults — same as <code>xibecode config --reset</code>.</p>
    <button class="btn danger" onclick="resetAll()">Reset All Settings</button>
  </div>

  <!-- Save -->
  <div style="display:flex;gap:10px;margin-top:8px;padding-top:16px;border-top:1px solid var(--vscode-panel-border);">
    <button class="btn" onclick="save()">Save Settings</button>
    <button class="btn secondary" onclick="reload()">Reload from disk</button>
  </div>

  <div class="toast" id="toast"></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let currentProfile = 'default';
  let fetchedModels = [];

  function q(id){ return document.getElementById(id); }

  function toast(msg, dur=2200){
    const el = q('toast'); el.textContent = msg;
    el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'), dur);
  }

  function toggleKeyVis(){
    const inp = q('apiKey');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  function toggleModelList(){
    q('modelList').classList.toggle('visible');
  }

  function switchProfile(){
    vscode.postMessage({ command:'switchProfile', profile: q('profileSelect').value });
  }

  function clearKey(){
    if(!confirm('Clear the saved API key for profile "'+currentProfile+'"?')) return;
    vscode.postMessage({ command:'clearApiKey', profile: currentProfile });
  }

  function resetAll(){
    if(!confirm('Reset ALL settings for profile "'+currentProfile+'"? This cannot be undone.')) return;
    vscode.postMessage({ command:'resetAll', profile: currentProfile });
  }

  function fetchModels(){
    const baseUrl = q('baseUrl').value.trim();
    const apiKey  = q('apiKey').value.trim();
    const provider = q('provider').value;
    if(!apiKey){ toast('Set an API Key first.'); return; }
    q('fetchStatus').textContent = 'Fetching…';
    vscode.postMessage({ command:'fetchModels', baseUrl, apiKey, provider });
  }

  function save(){
    const cfg = {
      apiKey:                   q('apiKey').value.trim()             || undefined,
      baseUrl:                  q('baseUrl').value.trim()            || undefined,
      provider:                 q('provider').value                  || undefined,
      model:                    q('model').value.trim()              || undefined,
      planningModel:            q('planningModel').value.trim()      || undefined,
      executionModel:           q('executionModel').value.trim()     || undefined,
      costMode:                 q('costMode').value,
      economyModel:             q('economyModel').value.trim()       || undefined,
      economyMaxIterations:     parseInt(q('economyMaxIterations').value)||undefined,
      maxIterations:            parseInt(q('maxIterations').value)   ||undefined,
      preferredPackageManager:  q('preferredPackageManager').value,
      testCommandOverride:      q('testCommandOverride').value.trim()||undefined,
      showThinking:             q('showThinking').checked,
      defaultVerbose:           q('defaultVerbose').checked,
    };
    vscode.postMessage({ command:'save', config: cfg, profile: currentProfile });
    toast('Settings saved!');
  }

  function reload(){
    vscode.postMessage({ command:'getConfig' });
  }

  function applyConfig(cfg, profile, profiles){
    currentProfile = profile;
    q('activeBadge').textContent = profile;

    // Update profile dropdown
    const sel = q('profileSelect');
    sel.innerHTML = '';
    profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      if (p === profile) opt.selected = true;
      sel.appendChild(opt);
    });

    // Apply fields
    q('apiKey').value            = '';   // never pre-fill the real key
    q('maskedKey').textContent   = cfg.apiKeyMasked ? '🔑 Current: '+cfg.apiKeyMasked : 'No key set';
    q('baseUrl').value           = cfg.baseUrl||'';
    q('provider').value          = cfg.provider||'';
    q('model').value             = cfg.model||'';
    q('planningModel').value     = cfg.planningModel||'';
    q('executionModel').value    = cfg.executionModel||'';
    q('costMode').value          = cfg.costMode||'normal';
    q('economyModel').value      = cfg.economyModel||'';
    q('economyMaxIterations').value = cfg.economyMaxIterations||50;
    q('maxIterations').value     = cfg.maxIterations||50;
    q('preferredPackageManager').value = cfg.preferredPackageManager||'pnpm';
    q('testCommandOverride').value = cfg.testCommandOverride||'';
    q('showThinking').checked    = cfg.showThinking!==false;
    q('defaultVerbose').checked  = !!cfg.defaultVerbose;
  }

  window.addEventListener('message', e=>{
    const msg = e.data;
    switch(msg.type){
      case 'config':
        applyConfig(msg.config, msg.profile, msg.profiles);
        break;
      case 'clearedKey':
        q('maskedKey').textContent='No key set'; toast('API key cleared.');
        break;
      case 'resetDone':
        reload(); toast('Reset done.');
        break;
      case 'models': {
        fetchedModels = msg.models;
        q('fetchStatus').textContent = msg.models.length+' models loaded';
        const list = q('modelList');
        list.innerHTML = '';
        msg.models.forEach(m => {
          const item = document.createElement('div');
          item.className = 'model-item';
          item.textContent = m;
          item.onclick = () => pickModel(m);
          list.appendChild(item);
        });
        list.classList.add('visible');
        break;
      }
      case 'modelsError':
        q('fetchStatus').textContent = 'Error: '+msg.message;
        break;
    }
  });

  function pickModel(m){
    q('model').value = m;
    q('modelList').classList.remove('visible');
  }

  // Load on open
  vscode.postMessage({ command:'getConfig' });
</script>
</body>
</html>`;
  }
}
