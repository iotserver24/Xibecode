declare module 'marked-terminal' {
  import type { Renderer } from 'marked';

  interface MarkedTerminalOptions {
    /**
     * Enable or disable color output. Defaults to true.
     */
    colors?: boolean;
    /**
     * Whether to show section headings underlined.
     */
    headingBold?: boolean;
  }

  class TerminalRenderer extends (Function as any) {
    constructor(options?: MarkedTerminalOptions);
  }

  export = TerminalRenderer;
}

