import chalk from 'chalk';

export type ThemeName =
  | 'default'
  | 'catppuccin'
  | 'dracula'
  | 'nord'
  | 'gruvbox'
  | 'monokai'
  | 'solarized';

export interface ThemeTokens {
  // Brand
  brand: (s: string) => string;
  brandDim: (s: string) => string;
  // UI chrome
  border: (s: string) => string;
  panel: (s: string) => string;
  // Content
  text: (s: string) => string;
  dim: (s: string) => string;
  dimBold: (s: string) => string;
  muted: (s: string) => string;
  // Semantic
  success: (s: string) => string;
  error: (s: string) => string;
  warn: (s: string) => string;
  info: (s: string) => string;
  // Roles
  tool: (s: string) => string;
  toolDim: (s: string) => string;
  user: (s: string) => string;
  assistant: (s: string) => string;
  // Emphasis
  bold: (s: string) => string;
  code: (s: string) => string;
}

export const THEME_NAMES: ThemeName[] = [
  'default',
  'catppuccin',
  'dracula',
  'nord',
  'gruvbox',
  'monokai',
  'solarized',
];

type ThemePalette = {
  brand: string;
  brandDim: string;
  border: string;
  panel: string;
  text: string;
  dim: string;
  dimBold: string;
  muted: string;
  success: string;
  error: string;
  warn: string;
  info: string;
  tool: string;
  toolDim: string;
  user: string;
  assistant: string;
  code: string;
};

function buildTokens(p: ThemePalette): ThemeTokens {
  return {
    brand: chalk.hex(p.brand).bold,
    brandDim: chalk.hex(p.brandDim),
    border: chalk.hex(p.border),
    panel: chalk.hex(p.panel),
    text: chalk.hex(p.text),
    dim: chalk.hex(p.dim),
    dimBold: chalk.hex(p.dimBold).bold,
    muted: chalk.hex(p.muted),
    success: chalk.hex(p.success),
    error: chalk.hex(p.error),
    warn: chalk.hex(p.warn),
    info: chalk.hex(p.info),
    tool: chalk.hex(p.tool),
    toolDim: chalk.hex(p.toolDim),
    user: chalk.hex(p.user).bold,
    assistant: chalk.hex(p.assistant).bold,
    bold: chalk.bold.white,
    code: chalk.hex(p.code),
  };
}

const PALETTES: Record<ThemeName, ThemePalette> = {
  default: {
    brand: '#00D4FF',
    brandDim: '#0099BB',
    border: '#3A3A4A',
    panel: '#555577',
    text: '#FFFFFF',
    dim: '#6B6B7B',
    dimBold: '#8888AA',
    muted: '#4A4A5A',
    success: '#00E676',
    error: '#FF5252',
    warn: '#FFD740',
    info: '#40C4FF',
    tool: '#BB86FC',
    toolDim: '#7B5EA7',
    user: '#00E676',
    assistant: '#00D4FF',
    code: '#CE93D8',
  },
  catppuccin: {
    // mocha-ish
    brand: '#89B4FA',
    brandDim: '#74C7EC',
    border: '#313244',
    panel: '#45475A',
    text: '#CDD6F4',
    dim: '#A6ADC8',
    dimBold: '#BAC2DE',
    muted: '#585B70',
    success: '#A6E3A1',
    error: '#F38BA8',
    warn: '#F9E2AF',
    info: '#89DCEB',
    tool: '#CBA6F7',
    toolDim: '#B4BEFE',
    user: '#A6E3A1',
    assistant: '#89B4FA',
    code: '#F5C2E7',
  },
  dracula: {
    brand: '#BD93F9',
    brandDim: '#6272A4',
    border: '#44475A',
    panel: '#6272A4',
    text: '#F8F8F2',
    dim: '#BFBFBF',
    dimBold: '#F8F8F2',
    muted: '#6272A4',
    success: '#50FA7B',
    error: '#FF5555',
    warn: '#F1FA8C',
    info: '#8BE9FD',
    tool: '#FF79C6',
    toolDim: '#BD93F9',
    user: '#50FA7B',
    assistant: '#BD93F9',
    code: '#FFB86C',
  },
  nord: {
    brand: '#88C0D0',
    brandDim: '#81A1C1',
    border: '#3B4252',
    panel: '#434C5E',
    text: '#ECEFF4',
    dim: '#D8DEE9',
    dimBold: '#E5E9F0',
    muted: '#4C566A',
    success: '#A3BE8C',
    error: '#BF616A',
    warn: '#EBCB8B',
    info: '#5E81AC',
    tool: '#B48EAD',
    toolDim: '#81A1C1',
    user: '#A3BE8C',
    assistant: '#88C0D0',
    code: '#D08770',
  },
  gruvbox: {
    brand: '#FABD2F',
    brandDim: '#D79921',
    border: '#3C3836',
    panel: '#504945',
    text: '#EBDBB2',
    dim: '#D5C4A1',
    dimBold: '#EBDBB2',
    muted: '#665C54',
    success: '#B8BB26',
    error: '#FB4934',
    warn: '#FE8019',
    info: '#83A598',
    tool: '#D3869B',
    toolDim: '#BDAE93',
    user: '#B8BB26',
    assistant: '#FABD2F',
    code: '#D3869B',
  },
  monokai: {
    brand: '#66D9EF',
    brandDim: '#A6E22E',
    border: '#3E3D32',
    panel: '#75715E',
    text: '#F8F8F2',
    dim: '#CFCFC2',
    dimBold: '#F8F8F2',
    muted: '#75715E',
    success: '#A6E22E',
    error: '#F92672',
    warn: '#FD971F',
    info: '#66D9EF',
    tool: '#AE81FF',
    toolDim: '#75715E',
    user: '#A6E22E',
    assistant: '#66D9EF',
    code: '#FD971F',
  },
  solarized: {
    // dark-ish solarized
    brand: '#2AA198',
    brandDim: '#268BD2',
    border: '#073642',
    panel: '#586E75',
    text: '#EEE8D5',
    dim: '#93A1A1',
    dimBold: '#EEE8D5',
    muted: '#586E75',
    success: '#859900',
    error: '#DC322F',
    warn: '#B58900',
    info: '#268BD2',
    tool: '#6C71C4',
    toolDim: '#839496',
    user: '#859900',
    assistant: '#2AA198',
    code: '#CB4B16',
  },
};

export function getTheme(name: ThemeName): ThemeTokens {
  return buildTokens(PALETTES[name] ?? PALETTES.default);
}

export function isThemeName(x: string): x is ThemeName {
  return (THEME_NAMES as string[]).includes(x);
}

