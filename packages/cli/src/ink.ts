import { createElement, type ReactNode } from 'react';
import {
  render as inkRender,
  type Instance,
  type RenderOptions,
} from 'ink';
import { ThemeProvider } from './components/design-system/ThemeProvider.js';
import { getBaseRenderOptions } from './utils/renderOptions.js';

export type { RenderOptions, Instance };
export type { BoxProps } from './components/design-system/ThemedBox.js';
export type { Props as TextProps } from './components/design-system/ThemedText.js';

function withTheme(node: ReactNode): ReactNode {
  return createElement(ThemeProvider, null, node);
}

function mergeRenderOptions(options?: NodeJS.WriteStream | RenderOptions): RenderOptions {
  if (!options || typeof (options as NodeJS.WriteStream).write === 'function') {
    const stdout = options as NodeJS.WriteStream | undefined;
    return {
      ...getBaseRenderOptions(false),
      ...(stdout ? { stdout } : {}),
    };
  }
  const renderOpts = options as RenderOptions;
  const exitOnCtrlC = renderOpts.exitOnCtrlC ?? false;
  return {
    ...getBaseRenderOptions(exitOnCtrlC),
    ...renderOpts,
  };
}

export function render(
  node: ReactNode,
  options?: NodeJS.WriteStream | RenderOptions,
): Instance {
  return inkRender(withTheme(node), mergeRenderOptions(options));
}

export type InkRoot = {
  render: (node: ReactNode) => void;
  rerender: (node: ReactNode) => void;
  unmount: () => void;
  waitUntilExit: Instance['waitUntilExit'];
  cleanup: () => void;
  clear: () => void;
};

/**
 * Ink 6 does not ship createRoot; this mirrors OpenClaude’s pattern for incremental renders.
 */
export function createRoot(options?: RenderOptions): InkRoot {
  const merged = mergeRenderOptions(options);
  let instance: Instance | undefined;

  const mount = (node: ReactNode): void => {
    const wrapped = withTheme(node);
    if (!instance) {
      instance = inkRender(wrapped, merged);
    } else {
      instance.rerender(wrapped);
    }
  };

  return {
    render: mount,
    rerender: mount,
    unmount: () => {
      instance?.unmount();
    },
    waitUntilExit: () => instance?.waitUntilExit() ?? Promise.resolve(),
    cleanup: () => instance?.cleanup(),
    clear: () => instance?.clear(),
  };
}

export { default as Box } from './components/design-system/ThemedBox.js';
export { default as Text } from './components/design-system/ThemedText.js';
export {
  ThemeProvider,
  usePreviewTheme,
  useTheme,
  useThemeSetting,
} from './components/design-system/ThemeProvider.js';

export { useInput, useApp, Static } from 'ink';
export type { Key } from 'ink';
