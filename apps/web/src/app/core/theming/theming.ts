import { DOCUMENT } from '@angular/common';
import { inject, Service } from '@angular/core';
import type { IColors, IThemePalette } from './interfaces';
import { TonalPalette } from './palette';
import { THEME_CONFIG } from './provider';

@Service()
export class Theming {
  // Dependencies
  private document = inject(DOCUMENT);
  private themeConfig = inject(THEME_CONFIG);

  // DOM
  private themeStyleEl = this.document.createElement('style');

  constructor() {
    // Append the themeStyleEl to the DOM
    this.document.head.appendChild(this.themeStyleEl);
    this.themeStyleEl.classList.add('theme-colors');

    this.generateTheme(this.themeConfig);
  }

  /**
   * Generates a theme using the provided theming configuration and
   * applies it to the DOM by injecting CSS variables into a
   * style element.
   */
  private generateTheme(config: IColors): IThemePalette {
    const primary = new TonalPalette({
      color: config.primary
    });
    const error = new TonalPalette({
      color: config.error
    });

    this.themeStyleEl.textContent = `:root {
      /* Primary */
      --theme-color-primary-50: ${primary.hue(50)};
      --theme-color-primary-100: ${primary.hue(100)};
      --theme-color-primary-200: ${primary.hue(200)};
      --theme-color-primary-300: ${primary.hue(300)};
      --theme-color-primary-400: ${primary.hue(400)};
      --theme-color-primary-500: ${primary.hue(500)};
      --theme-color-primary-600: ${primary.hue(600)};
      --theme-color-primary-700: ${primary.hue(700)};
      --theme-color-primary-800: ${primary.hue(800)};
      --theme-color-primary-900: ${primary.hue(900)};
      --theme-color-primary-950: ${primary.hue(950)};

      /* Secondary */
      --theme-color-secondary: ${config.secondary};

      /* Error */
      --theme-color-error-50: ${error.hue(50)};
      --theme-color-error-100: ${error.hue(100)};
      --theme-color-error-200: ${error.hue(200)};
      --theme-color-error-300: ${error.hue(300)};
      --theme-color-error-400: ${error.hue(400)};
      --theme-color-error-500: ${error.hue(500)};
      --theme-color-error-600: ${error.hue(600)};
      --theme-color-error-700: ${error.hue(700)};
      --theme-color-error-800: ${error.hue(800)};
      --theme-color-error-900: ${error.hue(900)};
      --theme-color-error-950: ${error.hue(950)};
    }`;

    return {
      primary,
      error
    };
  }
}
