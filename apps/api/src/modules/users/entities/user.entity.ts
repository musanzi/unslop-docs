import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { UserStatus } from '../user-status';
import { Role } from '../../roles/entities';
import { AbstractEntity } from '@api/shared/abstracts';

@Entity()
export class User extends AbstractEntity {
  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status', default: UserStatus.FREE })
  status: UserStatus = UserStatus.FREE;

  @Column()
  email: string;

  @Column()
  name: string;

  @Column({ nullable: true, unique: true })
  googleSubject: string;

  @Column({ default: false })
  googleEmailVerified: boolean;

  @Column({ nullable: true })
  avatar: string;

  @ManyToMany(() => Role)
  @JoinTable({ name: 'user_roles' })
  roles: Role[];
}
