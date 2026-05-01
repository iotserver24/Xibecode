import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import { Text as InkText } from 'ink';
import type { TextProps } from 'ink';
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

export type Props = Omit<TextProps, 'color' | 'backgroundColor'> & {
  readonly color?: ThemeOrRawColor;
  readonly backgroundColor?: ThemeOrRawColor;
  readonly children?: ReactNode;
};

export default function ThemedText({ color, backgroundColor, ...rest }: Props) {
  const { theme } = useTheme();
  const resolvedColor = useMemo(() => resolveColor(color, theme), [color, theme]);
  const resolvedBg = useMemo(
    () => resolveColor(backgroundColor, theme),
    [backgroundColor, theme],
  );
  return (
    <InkText
      {...rest}
      color={resolvedColor as TextProps['color']}
      backgroundColor={resolvedBg as TextProps['backgroundColor']}
    />
  );
}
