import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { UserDetailStore } from '../../data-access/user-detail.store';

@Component({
  imports: [DatePipe, FormsModule, RouterLink, MatIcon],
  templateUrl: './user-detail.html',
  providers: [UserDetailStore]
})
export default class UserDetail {
  protected readonly store = inject(UserDetailStore);
}
