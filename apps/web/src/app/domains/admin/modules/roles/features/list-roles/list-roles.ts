import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import type { IRoleResponse } from '@unslop-docs/api-contracts';
import { filter } from 'rxjs';

import { Message } from '@web/shared/ui';

import { RolesService, RolesStore } from '@web/domains/admin/modules/roles/data-access';
import { IRemoveRoleDialogData, IRoleDialogData, IRoleDialogResult } from '@web/domains/admin/modules/roles/interfaces';
import { RemoveRoleDialog, RoleFormDialog } from '@web/domains/admin/modules/roles/ui';

@Component({
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule, MatTableModule, Message],
  templateUrl: './list-roles.html',
  providers: [RolesService, RolesStore]
})
export default class Roles {
  protected readonly data = inject(RolesService);
  protected readonly store = inject(RolesStore);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly displayedColumns = ['name', 'createdAt', 'updatedAt', 'actions'];

  protected openCreateDialog(): void {
    this.dialog
      .open<RoleFormDialog, IRoleDialogData, IRoleDialogResult>(RoleFormDialog, {
        data: {},
        width: '28rem'
      })
      .afterClosed()
      .pipe(
        filter((result): result is IRoleDialogResult => result !== undefined),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ payload }) => this.store.createRole(payload));
  }

  protected openUpdateDialog(role: IRoleResponse): void {
    this.dialog
      .open<RoleFormDialog, IRoleDialogData, IRoleDialogResult>(RoleFormDialog, {
        data: { role },
        width: '28rem'
      })
      .afterClosed()
      .pipe(
        filter((result): result is IRoleDialogResult => result !== undefined),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ payload }) => this.store.updateRole({ id: role.id, payload }));
  }

  protected openRemoveDialog(role: IRoleResponse): void {
    this.dialog
      .open<RemoveRoleDialog, IRemoveRoleDialogData, boolean>(RemoveRoleDialog, {
        data: { role },
        width: '28rem'
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => confirmed === true),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.store.removeRole({ id: role.id }));
  }
}
