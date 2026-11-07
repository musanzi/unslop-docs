import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserStatus } from '../user-status';
import { User } from './user.entity';

@Entity()
@Index('IDX_status_change_user_history', ['userId', 'createdAt', 'id'])
export class StatusChange {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'FK_status_change_user' })
  user: User;

  @Column({ type: 'uuid' })
  adminId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'adminId', foreignKeyConstraintName: 'FK_status_change_admin' })
  admin: User;

  @Column()
  adminEmail: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'clock_timestamp()' })
  createdAt: Date;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status' })
  previousStatus: UserStatus;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status' })
  newStatus: UserStatus;
}
