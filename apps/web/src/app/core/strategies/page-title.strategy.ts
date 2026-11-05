import { inject, Service } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Service()
export class PageTitleStrategy extends TitleStrategy {
  private title = inject(Title);

  constructor() {
    super();
  }

  override updateTitle(routerState: RouterStateSnapshot) {
    const title = this.buildTitle(routerState);

    if (title !== undefined) {
      this.title.setTitle(`unslop-docs | ${title}`);
    }
  }
}
