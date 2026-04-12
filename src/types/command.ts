import type * as React from 'react';

export type CommandResultDisplay = 'skip' | 'system' | 'user';

export type LocalJSXCommandOnDone = (
  result?: string,
  options?: {
    display?: CommandResultDisplay;
    shouldQuery?: boolean;
    metaMessages?: string[];
    nextInput?: string;
    submitNextInput?: boolean;
  },
) => void;

export type LocalJSXCommandContext = {
  argv: string[];
};

export type LocalJSXCommandCall = (
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
) => Promise<React.ReactNode>;

export type LocalJSXCommand = {
  type: 'local-jsx';
  name: string;
  description: string;
  isEnabled?: () => boolean;
  immediate?: boolean;
  load: () => Promise<{
    call: LocalJSXCommandCall;
  }>;
};
