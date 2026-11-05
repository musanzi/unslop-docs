import { User } from '../entities';
import { IUserResponse } from '../interfaces';

export function mapUserRoles(user: User): IUserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    roles: ['user'],
    isAdmin: false
  };
}

export function mapUsersRoles(users: User[]): IUserResponse[] {
  return users.map(mapUserRoles);
}
