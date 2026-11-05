import { Component } from '@angular/core';

@Component({
  selector: 'app-page-loader',
  templateUrl: './page-loader.html',
  styles: `
    .loader {
      width: 50px;
      aspect-ratio: 1;
      border-radius: 50%;
      border: 8px solid #0000;
      border-right-color: var(--theme-color-primary-500);
      position: relative;
      animation: l24 1s infinite linear;
    }
    .loader:before,
    .loader:after {
      content: '';
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      border: inherit;
      animation: inherit;
      animation-duration: 2s;
    }
    .loader:after {
      animation-duration: 4s;
    }
    @keyframes l24 {
      100% {
        transform: rotate(1turn);
      }
    }
  `
})
export class PageLoader {}
