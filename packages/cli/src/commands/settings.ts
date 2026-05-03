/**
 * Settings command - manage multi-source settings.
 *
 * Usage:
 *   xc settings list              Show all merged settings
 *   xc settings get <key>         Get a specific setting value
 *   xc settings set <key> <val>   Set a setting in user-level config
 *   xc settings sources           Show settings sources and priorities
 *   xc settings paths             Show settings file paths
 */

import { SettingsManager, type SettingsSchema, type SettingsSource } from 'xibecode-core';

export async function settingsCommand(
  action: string | undefined,
  args: string[],
  options: { profile?: string },
): Promise<void> {
  const manager = new SettingsManager({ cwd: process.cwd() });
  const act = action || 'list';

  switch (act) {
    case 'list': {
      const settings = await manager.getSettings();
      console.log(JSON.stringify(settings, null, 2));
      break;
    }

    case 'get': {
      const key = args[0];
      if (!key) {
        console.error('Usage: xc settings get <key>');
        process.exit(1);
      }
      const settings = await manager.getSettings();
      const value = (settings as any)[key];
      if (value === undefined) {
        console.log(`Setting "${key}" is not set.`);
      } else {
        console.log(JSON.stringify(value, null, 2));
      }
      break;
    }

    case 'set': {
      const key = args[0];
      const value = args[1];
      if (!key || value === undefined) {
        console.error('Usage: xc settings set <key> <value>');
        console.error('  For objects/arrays, pass JSON: xc settings set permissions \'{"allow":["Read(*)"]}\'');
        process.exit(1);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }

      await manager.updateSource('user', { [key]: parsed } as Partial<SettingsSchema>);
      console.log(`Set "${key}" in user settings.`);
      break;
    }

    case 'sources': {
      const entries = await manager.getSourceEntries();
      if (entries.length === 0) {
        console.log('No settings files found.');
        break;
      }
      console.log('Settings sources (lowest to highest priority):\n');
      for (const entry of entries) {
        console.log(`  [${entry.source}] ${entry.path}`);
        const keys = Object.keys(entry.settings);
        if (keys.length > 0) {
          console.log(`    Keys: ${keys.join(', ')}`);
        } else {
          console.log('    (empty)');
        }
      }
      break;
    }

    case 'paths': {
      const paths = manager.getSourcePaths();
      console.log('Settings file paths:\n');
      for (const [source, path] of Object.entries(paths)) {
        console.log(`  [${source}] ${path}`);
      }
      break;
    }

    default:
      console.error(`Unknown action: ${act}`);
      console.error('Available actions: list, get, set, sources, paths');
      process.exit(1);
  }
}
