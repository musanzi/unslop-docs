import { AbstractEntity } from '@api/shared/abstracts';
import { User } from '@api/modules/users/entities';
import { Column, Entity, ManyToMany } from 'typeorm';

@Entity()
export class Role extends AbstractEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  name: string;

  @ManyToMany(() => User)
  users: User[];
}
