import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { DocumentResponse, documentResponse } from '../dto/document-response';
import { Document } from '../entities/document.entity';
import { MonthlyAllowance } from '../monthly-allowance';

export class RetryDocument {
  constructor(
    public readonly ownerId: string,
    public readonly id: string
  ) {}
}

@CommandHandler(RetryDocument)
export class RetryDocumentHandler implements ICommandHandler<RetryDocument, DocumentResponse> {
  constructor(
    private readonly database: DataSource,
    private readonly allowance: MonthlyAllowance
  ) {}

  async execute({ ownerId, id }: RetryDocument): Promise<DocumentResponse> {
    if (!isUUID(id)) throw new NotFoundException('Document not found.');
    try {
      return await this.database.transaction(async (manager) => {
        const [document]: Document[] = await manager.query(
          'SELECT * FROM document WHERE id = $1 AND "ownerId" = $2 FOR UPDATE',
          [id, ownerId]
        );
        if (!document) throw new NotFoundException('Document not found.');
        if (document.status !== 'failed') throw new ConflictException('Only failed documents can be retried.');
        await this.allowance.reserve(manager, ownerId, id);
        const [queued]: Document[] = await manager.query(
          `UPDATE document SET status = 'queued', "failureCode" = NULL, "processingStage" = NULL,
            "processingAttemptId" = NULL, "providerRequests" = '{}'::jsonb, "nextRequestAt" = NULL,
            "processingStartedAt" = NULL, "processingDeadline" = NULL, "leaseExpiresAt" = NULL,
            "claimToken" = NULL, assessment = NULL, "revisedKey" = NULL, "revisedSize" = NULL, "revisionNotices" = NULL
          WHERE id = $1 RETURNING *`,
          [id]
        );
        return documentResponse(queued);
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(
        'The retry could not be confirmed. Refresh your history before trying again.'
      );
    }
  }
}
