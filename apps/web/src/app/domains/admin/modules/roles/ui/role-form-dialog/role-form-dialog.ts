import { Component, inject, signal } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { ICreateRoleDto } from '@unslop-docs/api-contracts';

import { IRoleDialogData, IRoleDialogResult } from '@web/domains/admin/modules/roles/interfaces';

@Component({
  imports: [FormField, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './role-form-dialog.html'
})
export class RoleFormDialog {
  protected readonly data = inject<IRoleDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RoleFormDialog, IRoleDialogResult>);

  protected readonly roleModel = signal<ICreateRoleDto>({ name: this.data.role?.name ?? '' });
  protected readonly roleForm = form(this.roleModel, (schemaPath) => {
    required(schemaPath.name, { message: 'Name is required.' });
    validate(schemaPath.name, ({ value }) => {
      if (value().trim().length === 0) {
        return { kind: 'whitespace', message: 'Name is required.' };
      }
      return undefined;
    });
  });

  protected onSubmit(): void {
    submit(this.roleForm, async (formState) => {
      this.dialogRef.close({ payload: { name: formState().value().name.trim() } });
    });
  }
}
