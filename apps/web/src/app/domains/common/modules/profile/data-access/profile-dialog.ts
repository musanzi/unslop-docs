import { inject, Service } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import Profile from '../features/profile/profile';

@Service()
export class ProfileDialog {
  private readonly dialog = inject(MatDialog);

  open() {
    return (
      this.dialog.getDialogById('profile-dialog') ??
      this.dialog.open(Profile, {
        id: 'profile-dialog',
        panelClass: 'app-dialog',
        width: '30rem',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100dvh - 2rem)',
        ariaLabelledBy: 'profile-dialog-heading',
        autoFocus: 'first-heading',
        restoreFocus: true,
        closePredicate: (_result, _config, component) => !(component instanceof Profile) || !component.isSaving()
      })
    );
  }
}
