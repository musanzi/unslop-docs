import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { IRemoveRoleDialogData } from '@web/domains/admin/modules/roles/interfaces';

@Component({
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './remove-role-dialog.html'
})
export class RemoveRoleDialog {
  protected readonly data = inject<IRemoveRoleDialogData>(MAT_DIALOG_DATA);
}
