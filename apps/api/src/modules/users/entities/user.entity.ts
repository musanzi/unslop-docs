import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { Role } from '../../roles/entities';
import { AbstractEntity } from '@api/shared/abstracts';

@Entity()
export class User extends AbstractEntity {
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
