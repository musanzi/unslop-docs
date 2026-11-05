import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'website-footer',
  imports: [RouterLink, MatIconModule],
  templateUrl: './footer.html'
})
export class WebsiteFooter {
  protected readonly currentYear = new Date().getFullYear();
}
