import React from 'react';
import type { InkRoot } from './ink.js';

export function showDialog<T = void>(
  root: InkRoot,
  renderer: (done: (result: T) => void) => React.ReactNode,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const done = (result: T): void => resolve(result);
    root.render(renderer(done));
  });
}

export async function exitWithMessage(
  root: InkRoot,
  message: string,
  options?: { color?: string; exitCode?: number },
): Promise<never> {
  const { Text } = await import('./ink.js');
  const exitCode = options?.exitCode ?? 1;
  const color = options?.color;

  root.render(color ? <Text color={color}>{message}</Text> : <Text>{message}</Text>);
  root.unmount();
  process.exit(exitCode);
}

export async function renderAndRun(
  root: InkRoot,
  element: React.ReactNode,
): Promise<void> {
  root.render(element);
  await root.waitUntilExit();
}
