import { Component, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIcon } from '@angular/material/icon';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Media } from '@web/core/media';
import { Sidebar } from '@web/shared/ui';

@Component({
  selector: 'admin-layout',
  imports: [MatIcon, RouterOutlet, Sidebar, MatSidenavContainer, MatSidenav, MatSidenavContent],
  host: { class: 'document-workspace-theme block bg-panel font-sans text-[0.9375rem] leading-[1.5] text-ink' },
  templateUrl: './layout.html'
})
export class AdminLayout {
  protected readonly isMobile = inject(Media).match('(max-width: 767px)');
  private readonly sidenav = viewChild(MatSidenav);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        if (this.isMobile()) void this.sidenav()?.close();
      });
  }
}
