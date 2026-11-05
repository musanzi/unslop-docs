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
        <website-header />
        <main id="main-content">
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
