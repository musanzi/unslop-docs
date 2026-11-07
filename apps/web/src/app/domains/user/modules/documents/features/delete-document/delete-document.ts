import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import type { IDocumentResponse } from '@unslop-docs/api-contracts';

@Component({ imports: [MatIcon], templateUrl: './delete-document.html' })
export default class DeleteDocument {
  protected readonly document = inject<IDocumentResponse>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<DeleteDocument, boolean>);
  protected readonly active = this.document.status === 'queued' || this.document.status === 'processing';
}
