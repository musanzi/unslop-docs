import { Component, inject, signal } from '@angular/core';
import { email, FormField, form, minLength, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { IUserDialogData, IUserDialogResult, IUserFormModel } from '@web/domains/admin/modules/users/interfaces';

@Component({
  imports: [FormField, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './user-form-dialog.html'
})
export class UserFormDialog {
  protected readonly data = inject<IUserDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<UserFormDialog, IUserDialogResult>);

  protected readonly userModel = signal<IUserFormModel>({
    email: this.data.user?.email ?? '',
    name: this.data.user?.name ?? '',
    roles: this.data.roles.filter((role) => this.data.user?.roles.includes(role.name)).map((role) => role.id)
  });

  protected readonly userForm = form(this.userModel, (schemaPath) => {
    required(schemaPath.name, { message: 'Name is required.' });
    required(schemaPath.email, { message: 'Email address is required.' });
    email(schemaPath.email, { message: 'Email address is invalid.' });
    minLength(schemaPath.roles, 1, { message: 'Select at least one role.' });
  });

  protected onSubmit(): void {
    submit(this.userForm, async (formState) => {
      const value = formState().value();
      this.dialogRef.close({
        payload: {
          ...value,
          email: value.email.trim(),
          name: value.name.trim()
        }
      });
    });
  }
}
