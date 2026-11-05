import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import type { IUserResponse } from '@unslop-docs/api-contracts';
import { filter } from 'rxjs';

import { Message } from '@web/shared/ui';

import { UsersService, UsersStore } from '@web/domains/admin/modules/users/data-access';
import { IRemoveUserDialogData, IUserDialogData, IUserDialogResult } from '@web/domains/admin/modules/users/interfaces';
import { RemoveUserDialog, UserFormDialog } from '@web/domains/admin/modules/users/ui';

@Component({
  imports: [
    DatePipe,
    FormsModule,
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
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly displayedColumns = ['name', 'email', 'roles', 'createdAt', 'actions'];

  protected onPageChange(event: PageEvent): void {
    this.data.page.set(event.pageIndex + 1);
  }

  protected openCreateDialog(): void {
    this.dialog
      .open<UserFormDialog, IUserDialogData, IUserDialogResult>(UserFormDialog, {
        data: { roles: this.data.roleOptions() },
        width: '28rem'
      })
      .afterClosed()
      .pipe(
        filter((result): result is IUserDialogResult => result !== undefined),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ payload }) => this.store.createUser(payload));
  }

  protected openUpdateDialog(user: IUserResponse): void {
    this.dialog
      .open<UserFormDialog, IUserDialogData, IUserDialogResult>(UserFormDialog, {
        data: { roles: this.data.roleOptions(), user },
        width: '28rem'
      })
      .afterClosed()
      .pipe(
        filter((result): result is IUserDialogResult => result !== undefined),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ payload }) => this.store.updateUser({ id: user.id, payload }));
  }

  protected openRemoveDialog(user: IUserResponse): void {
    this.dialog
      .open<RemoveUserDialog, IRemoveUserDialogData, boolean>(RemoveUserDialog, {
        data: { user },
        width: '28rem'
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => confirmed === true),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.store.removeUser({ id: user.id }));
  }
}
