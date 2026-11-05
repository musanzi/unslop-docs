import { Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NAVIGATION_LINKS } from '@web/domains/website/shared/data';

@Component({
  selector: 'website-header',
  imports: [MatButtonModule, MatIcon, RouterLink, RouterLinkActive],
  host: {
    '(window:scroll)': 'updateScrolledState()'
  },
  templateUrl: './header.html'
})
export class WebsiteHeader {
  protected isScrolled = signal(false);
  protected isMenuOpen = signal(false);

  protected links = NAVIGATION_LINKS;
  protected solidHeader = computed(() => this.isScrolled());

  protected toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  protected navLinkClasses(active: boolean): string {
    if (!this.isScrolled()) {
      return active
        ? 'border-white text-white'
        : 'border-transparent text-white/80 hover:border-white/40 hover:text-white';
    }

    return active
      ? 'border-primary-500 text-gray-950'
      : 'border-transparent text-gray-700 hover:border-gray-300 hover:text-gray-950';
  }

  protected mobileNavLinkClasses(active: boolean): string {
    return active ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950';
  }

  protected updateScrolledState(): void {
    this.isScrolled.set(window.scrollY > 0);
  }
}
