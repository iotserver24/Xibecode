import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import { Box as InkBox } from 'ink';
import type { BoxProps as InkBoxProps } from 'ink';
import type { TuiTheme, TuiThemeColorKey } from '../../utils/tui-theme.js';
import { useTheme } from './ThemeProvider.js';

export type ThemeOrRawColor = TuiThemeColorKey | (string & {});

function resolveColor(
  color: ThemeOrRawColor | undefined,
  theme: TuiTheme,
): string | undefined {
  if (!color) return undefined;
  if (
    color.startsWith('rgb(') ||
    color.startsWith('#') ||
    color.startsWith('ansi256(') ||
    color.startsWith('ansi:')
  ) {
    return color;
  }
  const key = color as TuiThemeColorKey;
  return (theme[key] as string | undefined) ?? theme.text;
}

type ThemedColorProps = {
  readonly borderColor?: ThemeOrRawColor;
  readonly borderTopColor?: ThemeOrRawColor;
  readonly borderBottomColor?: ThemeOrRawColor;
  readonly borderLeftColor?: ThemeOrRawColor;
  readonly borderRightColor?: ThemeOrRawColor;
  readonly backgroundColor?: ThemeOrRawColor;
};

export type BoxProps = Omit<
  InkBoxProps,
  | 'borderColor'
  | 'borderTopColor'
  | 'borderBottomColor'
  | 'borderLeftColor'
  | 'borderRightColor'
  | 'backgroundColor'
> &
  ThemedColorProps & {
    children?: ReactNode;
  };

export default function ThemedBox({
  borderColor,
  borderTopColor,
  borderBottomColor,
  borderLeftColor,
  borderRightColor,
  backgroundColor,
  children,
  ...rest
}: BoxProps) {
  const { theme } = useTheme();
  const bc = useMemo(() => resolveColor(borderColor, theme), [borderColor, theme]);
  const btc = useMemo(() => resolveColor(borderTopColor, theme), [borderTopColor, theme]);
  const bbc = useMemo(() => resolveColor(borderBottomColor, theme), [borderBottomColor, theme]);
  const blc = useMemo(() => resolveColor(borderLeftColor, theme), [borderLeftColor, theme]);
  const brc = useMemo(() => resolveColor(borderRightColor, theme), [borderRightColor, theme]);
  const bg = useMemo(() => resolveColor(backgroundColor, theme), [backgroundColor, theme]);

  return (
    <InkBox
      {...rest}
      borderColor={bc as InkBoxProps['borderColor']}
      borderTopColor={btc as InkBoxProps['borderTopColor']}
      borderBottomColor={bbc as InkBoxProps['borderBottomColor']}
      borderLeftColor={blc as InkBoxProps['borderLeftColor']}
      borderRightColor={brc as InkBoxProps['borderRightColor']}
      backgroundColor={bg as InkBoxProps['backgroundColor']}
    >
      {children}
    </InkBox>
  );
}
