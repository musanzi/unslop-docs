import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { IRemoveUserDialogData } from '@web/domains/admin/modules/users/interfaces';

@Component({
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './remove-user-dialog.html'
})
export class RemoveUserDialog {
  protected readonly data = inject<IRemoveUserDialogData>(MAT_DIALOG_DATA);
}
