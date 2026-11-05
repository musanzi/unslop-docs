import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities';

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

  @Column('integer')
  size: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
