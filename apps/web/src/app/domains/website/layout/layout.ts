import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PageLoader } from '@web/shared/ui';
import { WebsiteFooter, WebsiteHeader } from '@web/domains/website/shared/ui';

@Component({
  selector: 'web-layout',
  imports: [RouterOutlet, WebsiteHeader, WebsiteFooter, PageLoader],
  template: `
    @defer (on immediate) {
      <div class="min-h-screen overflow-x-hidden">
        <a
          href="#main-content"
          class="sr-only fixed left-4 top-4 z-[60] rounded bg-white p-3 text-neutral-950 focus:not-sr-only"
          >Skip to main content</a
        >
        <website-header />
        <main id="main-content" tabindex="-1">
          <router-outlet />
        </main>
        <website-footer />
      </div>
    } @placeholder {
      <app-page-loader />
    } @loading {
      <app-page-loader />
    }
  `
})
export class WebLayout {}
