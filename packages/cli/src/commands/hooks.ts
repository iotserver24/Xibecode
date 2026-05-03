/**
 * Hooks command - manage lifecycle hooks.
 *
 * Usage:
 *   xc hooks list                List all registered hooks
 *   xc hooks add <event> <type> <value>   Add a hook
 *   xc hooks remove <event> <index>        Remove a hook by index
 *   xc hooks events              List available hook events
 */

import { HooksManager, SettingsManager, HOOK_EVENTS } from 'xibecode-core';
import type { HookEvent, HookConfig, RegisteredHook } from 'xibecode-core';

export async function hooksCommand(
  action: string | undefined,
  args: string[],
  _options: { profile?: string },
): Promise<void> {
  const settingsManager = new SettingsManager({ cwd: process.cwd() });
  const hooksManager = new HooksManager(settingsManager);
  await hooksManager.loadFromSettingsManager();

  const act = action || 'list';

  switch (act) {
    case 'list': {
      const allHooks = hooksManager.getAllHooks();
      const flatList: Array<RegisteredHook & { index: number }> = [];
      let idx = 0;

      for (const [event, hooks] of allHooks) {
        for (const hook of hooks) {
          flatList.push({ ...hook, index: idx++ });
        }
      }

      if (flatList.length === 0) {
        console.log('No hooks configured.');
        console.log('Use "xc hooks add" to add one, or edit ~/.xibecode/settings.json');
        break;
      }

      console.log('Registered hooks:\n');
      for (const hook of flatList) {
        const config = hook.config;
        const type = 'command' in config ? 'command' : 'prompt' in config ? 'prompt' : 'agent' in config ? 'agent' : 'http' in config ? 'http' : 'function';
        const value = (config as any).command || (config as any).prompt || (config as any).agent || (config as any).http || '(function)';
        const matcher = hook.matcher ? ` matcher="${hook.matcher}"` : '';
        const once = (config as any).once ? ' [once]' : '';
        console.log(`  [${hook.index}] ${hook.event}${matcher}${once}`);
        console.log(`      type: ${type} | value: ${value}`);
      }
      break;
    }

    case 'add': {
      const event = args[0] as HookEvent;
      const type = args[1];
      const value = args.slice(2).join(' ');

      if (!event || !type || !value) {
        console.error('Usage: xc hooks add <event> <type> <value>');
        console.error('  Types: command, http');
        console.error('  Example: xc hooks add PreToolUse command "echo $TOOL_NAME >> /tmp/tool-log.txt"');
        process.exit(1);
      }

      if (!HOOK_EVENTS.includes(event)) {
        console.error(`Invalid event: ${event}`);
        console.error(`Available events: ${HOOK_EVENTS.join(', ')}`);
        process.exit(1);
      }

      let hookConfig: HookConfig;
      if (type === 'command') {
        hookConfig = { type: 'command', command: value } as HookConfig;
      } else if (type === 'http') {
        hookConfig = { type: 'http', url: value } as HookConfig;
      } else {
        console.error(`Unsupported hook type: ${type}. Supported: command, http`);
        process.exit(1);
      }

      const settings = await settingsManager.getSettings();
      const hooks = settings.hooks || ({} as any);
      const eventHooks = hooks[event] || [];
      eventHooks.push({ matcher: undefined, hooks: [hookConfig] });
      hooks[event] = eventHooks;

      await settingsManager.updateSource('user', { hooks } as any);
      console.log(`Added ${type} hook for ${event}.`);
      break;
    }

    case 'remove': {
      const event = args[0] as HookEvent;
      const indexStr = args[1];

      if (!event || indexStr === undefined) {
        console.error('Usage: xc hooks remove <event> <index>');
        console.error('  Use "xc hooks list" to see hook indices.');
        process.exit(1);
      }

      const index = parseInt(indexStr, 10);
      const settings = await settingsManager.getSettings();
      const hooks = settings.hooks || ({} as any);
      const eventHooks = hooks[event];

      if (!eventHooks || !Array.isArray(eventHooks)) {
        console.error(`No hooks found for event: ${event}`);
        process.exit(1);
      }

      if (index < 0 || index >= eventHooks.length) {
        console.error(`Invalid index: ${index}. Event ${event} has ${eventHooks.length} hook(s).`);
        process.exit(1);
      }

      eventHooks.splice(index, 1);
      if (eventHooks.length === 0) {
        delete hooks[event];
      }

      await settingsManager.updateSource('user', { hooks } as any);
      console.log(`Removed hook [${index}] from ${event}.`);
      break;
    }

    case 'events': {
      console.log('Available hook events:\n');
      for (const evt of HOOK_EVENTS) {
        const desc = getEventDescription(evt);
        console.log(`  ${evt.padEnd(20)} ${desc}`);
      }
      break;
    }

    default:
      console.error(`Unknown action: ${act}`);
      console.error('Available actions: list, add, remove, events');
      process.exit(1);
  }
}

function getEventDescription(event: string): string {
  const descriptions: Record<string, string> = {
    PreToolUse: 'Before a tool is executed',
    PostToolUse: 'After a tool is executed',
    SessionStart: 'When a session begins',
    SessionEnd: 'When a session ends',
    UserPromptSubmit: 'When user submits a prompt',
    Stop: 'When the agent stops normally',
    StopFailure: 'When the agent stops due to failure',
    PreCompact: 'Before context compaction',
    PostCompact: 'After context compaction',
  };
  return descriptions[event] || '';
}
