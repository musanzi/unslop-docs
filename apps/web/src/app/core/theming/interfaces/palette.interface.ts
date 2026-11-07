export interface IPaletteConfig {
  color: string;
  hue?: number;
  hues?: number[];
  colorMode?: 'linear' | 'perceived';
  h?: number;
  s?: number;
  lMin?: number;
  lMax?: number;
  mode?: 'hex' | 'p-3' | 'oklch' | 'hsl';
}

export interface IPaletteColor {
  hue: number;
  hex: string;
  oklch: string;
  h: number;
  hScale: number;
  s: number;
  sScale: number;
  l: number;
}
