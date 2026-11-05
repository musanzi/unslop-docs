import { DatePipe } from '@angular/common';
import { Component, inject, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { disabled, form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';

import { Message } from '@web/shared/ui';

import { UsersService, UsersStore } from '@web/domains/admin/modules/users/data-access';

@Component({
  imports: [
    DatePipe,
    FormsModule,
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatPaginatorModule,
    MatTableModule,
    Message
  ],
  templateUrl: './users-list.html',
  providers: [UsersService, UsersStore]
})
export default class UsersList {
  protected readonly data = inject(UsersService);
  protected readonly store = inject(UsersStore);

  protected readonly displayedColumns = ['name', 'email', 'status', 'createdAt', 'actions'];
  protected readonly statusModel = linkedSignal(() => ({ status: this.data.selectedUser()?.status ?? 'FREE' }));
  protected readonly statusForm = form(this.statusModel, (path) => {
    disabled(path.status, () => this.store.isUpdating());
  });

  protected saveStatus(): void {
    const user = this.data.selectedUser();
    if (user) this.store.updateStatus({ userId: user.id, status: this.statusModel().status });
  }

  protected onPageChange(event: PageEvent): void {
    this.data.page.set(event.pageIndex + 1);
  }
}
