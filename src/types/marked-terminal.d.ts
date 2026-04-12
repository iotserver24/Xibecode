declare module 'marked-terminal' {
  export function markedTerminal(
    options?: {
      width?: number;
      reflowText?: boolean;
      showSectionPrefix?: boolean;
      [key: string]: unknown;
    },
    highlightOptions?: Record<string, unknown>,
  ): object;

  const Renderer: unknown;
  export default Renderer;
}
