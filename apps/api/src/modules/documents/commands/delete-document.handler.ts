import { HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentStorage } from '../document-storage';

export class DeleteDocument {
  constructor(
    public readonly ownerId: string,
    public readonly id: string
  ) {}
}

@CommandHandler(DeleteDocument)
export class DeleteDocumentHandler implements ICommandHandler<DeleteDocument, void> {
  constructor(
    private readonly database: DataSource,
    private readonly storage: DocumentStorage
  ) {}

  async execute({ ownerId, id }: DeleteDocument): Promise<void> {
    if (!isUUID(id)) throw new NotFoundException('Document not found.');
    try {
      await this.database.transaction(async (manager) => {
        const [document]: Document[] = await manager.query(
          'SELECT * FROM document WHERE id = $1 AND "ownerId" = $2 FOR UPDATE',
          [id, ownerId]
        );
        if (!document) throw new NotFoundException('Document not found.');
        for (const key of [document.originalKey, document.revisedKey]) if (key) await this.storage.remove(key);
        await manager.query('DELETE FROM document WHERE id = $1', [id]);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('The document could not be deleted. Try again.');
    }
  }
}
