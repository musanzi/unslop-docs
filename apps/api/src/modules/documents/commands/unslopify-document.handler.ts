import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { DocumentResponse, documentResponse } from '../dto/document-response';
import { Document } from '../entities/document.entity';
import { MonthlyAllowance } from '../monthly-allowance';
import { defaultRewriteStrength } from '../document-processing';

export class UnslopifyDocument {
  constructor(
    public readonly ownerId: string,
    public readonly id: string,
    public readonly strength: number = defaultRewriteStrength
  ) {}
}

function refusal(document: Document): ConflictException {
  if (document.status === 'completed') return new ConflictException('This document already has a revised version.');
  if (document.phase === 'rewrite' && ['queued', 'processing'].includes(document.status))
    return new ConflictException('Rewriting is already queued for this document.');
  return new ConflictException('Only assessed documents can be rewritten.');
}

@CommandHandler(UnslopifyDocument)
export class UnslopifyDocumentHandler implements ICommandHandler<UnslopifyDocument, DocumentResponse> {
  constructor(
    private readonly database: DataSource,
    private readonly allowance: MonthlyAllowance
  ) {}

  async execute({ ownerId, id, strength = defaultRewriteStrength }: UnslopifyDocument): Promise<DocumentResponse> {
    if (!isUUID(id)) throw new NotFoundException('Document not found.');
    if (!Number.isInteger(strength) || strength < 1 || strength > 100)
      throw new BadRequestException('Choose a rewrite strength from 1 to 100.');
    try {
      return await this.database.transaction(async (manager) => {
        const [document]: Document[] = await manager.query(
          'SELECT * FROM document WHERE id = $1 AND "ownerId" = $2 FOR UPDATE',
          [id, ownerId]
        );
        if (!document) throw new NotFoundException('Document not found.');
        if (document.status !== 'assessed') throw refusal(document);
        await this.allowance.reserve(manager, ownerId, id);
        const [queued]: Document[] = await manager.query(
          `UPDATE document SET status = 'queued', phase = 'rewrite', strength = $2, "failureCode" = NULL,
            "processingStage" = NULL, "processingAttemptId" = NULL, "providerRequests" = '{}'::jsonb,
            "nextRequestAt" = NULL, "processingStartedAt" = NULL, "processingDeadline" = NULL,
            "leaseExpiresAt" = NULL, "claimToken" = NULL
          WHERE id = $1 RETURNING *`,
          [id, strength]
        );
        return documentResponse(queued);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Unslopify could not be confirmed. Refresh your history before trying again.'
      );
    }
  }
}
