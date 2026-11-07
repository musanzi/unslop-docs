import { Tree, TreeItem, TreeItemGroup } from '@angular/aria/tree';
import { CdkMonitorFocus } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIcon } from '@angular/material/icon';
import { isActive, IsActiveMatchOptions, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, take } from 'rxjs';
import { INavigationActiveOptions, INavigationItem } from '@web/shared/interfaces';

@Component({
  selector: 'navigation',
  imports: [MatIcon, NgTemplateOutlet, RouterLinkActive, Tree, TreeItem, TreeItemGroup, RouterLink, CdkMonitorFocus],
  templateUrl: './navigation.html'
})
export class Navigation {
  private router = inject(Router);

  readonly items = input.required<INavigationItem[]>();
  protected navigationEnd = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      take(1)
    )
  );

  constructor() {
    effect(() => {
      const navigationEnd = this.navigationEnd();
      if (!navigationEnd) {
        return;
      }

      this.expandActiveRoute(this.items());
    });
  }

  expandActiveRoute(items: INavigationItem[]): INavigationItem[] {
    for (const item of items) {
      if (item.children?.length) {
        item.children = this.expandActiveRoute(item.children);

        if (item.children.some((child) => child.expanded)) {
          item.expanded = true;
        }
      }

      if (
        item.route &&
        isActive(item.route, this.router, this.isActiveOption(item.activeOptions ?? { exact: true }))()
      ) {
        item.expanded = true;
      }
    }
    return items;
  }

  isActiveOption(options: INavigationActiveOptions): IsActiveMatchOptions {
    if ('exact' in options) {
      return options.exact
        ? {
            paths: 'exact',
            queryParams: 'exact',
            fragment: 'ignored',
            matrixParams: 'ignored'
          }
        : {
            paths: 'subset',
            queryParams: 'subset',
            fragment: 'ignored',
            matrixParams: 'ignored'
          };
    }

    return options;
  }
}
