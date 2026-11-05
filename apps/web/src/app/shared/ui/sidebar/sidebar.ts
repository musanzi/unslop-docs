import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { INavigationItem, IUserSummary } from '@web/shared/interfaces';
import { Navigation } from '../navigation/navigation';
import { User } from '../user/user';

@Component({
  selector: 'sidebar',
  imports: [Navigation, User, RouterLink],
  templateUrl: './sidebar.html'
})
export class Sidebar {
  readonly navigation = input.required<INavigationItem[]>();
  readonly editProfile = output<void>();
  readonly user = input.required<IUserSummary | null>();
  readonly signedOut = output<void>();
}
