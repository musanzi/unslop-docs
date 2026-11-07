import type { TonalPalette } from '../palette';

export interface IColors {
  primary: string;
  /** Single accent color for buttons and form controls; it gets no tonal palette. */
  secondary: string;
  error: string;
}

export type IThemeConfig = IColors;

export interface IThemePalette {
  primary: TonalPalette;
  error: TonalPalette;
}
