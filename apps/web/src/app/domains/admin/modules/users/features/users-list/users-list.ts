import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { UsersService, UsersStore } from '../../data-access';

@Component({
  imports: [DatePipe, FormsModule, RouterLink, MatIcon],
  templateUrl: './users-list.html',
  providers: [UsersService, UsersStore]
})
export default class UsersList {
  protected readonly data = inject(UsersService);
  protected readonly store = inject(UsersStore);
}
