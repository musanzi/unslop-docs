import { inject, Service } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import type { IDocumentResponse } from '@unslop-docs/api-contracts';
import DeleteDocument from '../features/delete-document/delete-document';

@Service()
export class DeleteDocumentDialog {
  private readonly dialog = inject(MatDialog);

  open(document: IDocumentResponse): MatDialogRef<DeleteDocument, boolean> {
    return (
      this.dialog.getDialogById('delete-document-dialog') ??
      this.dialog.open<DeleteDocument, IDocumentResponse, boolean>(DeleteDocument, {
        id: 'delete-document-dialog',
        panelClass: 'app-dialog',
        width: '28rem',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100dvh - 2rem)',
        ariaLabelledBy: 'delete-document-heading',
        autoFocus: 'first-heading',
        restoreFocus: true,
        data: document
      })
    );
  }
}
