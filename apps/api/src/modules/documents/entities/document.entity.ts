import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { ProcessingStage } from '../document-workflow';
import type { WritingAssessment } from '../assessment-workflow';
import type { DocumentStatus, ProcessingFailure } from '../document-processing';
import { User } from '../../users/entities';
import type { ProviderRequestCheckpoint } from '../../processing/document-jobs';

@Entity()
@Index('IDX_document_owner_history', ['ownerId', 'createdAt', 'id'])
export class Document {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ length: 240 })
  filename: string;

  @Column({ unique: true })
  originalKey: string;

  @Column({ type: 'varchar', nullable: true, unique: true, select: false })
  revisedKey: string | null;

  @Column({ type: 'integer', nullable: true })
  revisedSize: number | null;

  @Column({ type: 'varchar', nullable: true })
  processingStage: ProcessingStage | null;

  @Column('integer')
  size: number;

  @Column({ type: 'varchar', default: 'stored' })
  status: DocumentStatus;

  @Column({ type: 'uuid', nullable: true, select: false })
  claimToken: string | null;

  @Column({ type: 'uuid', nullable: true, select: false })
  processingAttemptId: string | null;

  @Column({ type: 'jsonb', default: {}, select: false })
  providerRequests: Record<string, ProviderRequestCheckpoint>;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  nextRequestAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  processingDeadline: Date | null;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  leaseExpiresAt: Date | null;

  @Column({ type: 'jsonb', nullable: true, select: false })
  assessment: WritingAssessment | null;

  @Column({ type: 'varchar', nullable: true })
  failureCode: ProcessingFailure | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
