import { Roles } from '@api/modules/auth/enums';
import { User } from '../entities';
import { IUserResponse } from '../interfaces';

export function mapUserRoles(user: User, adminEmail: string): IUserResponse {
  const isAdmin =
    !!user.googleSubject &&
    user.googleEmailVerified === true &&
    !!adminEmail.trim() &&
    user.email.toLowerCase() === adminEmail.trim().toLowerCase();
  return {
    id: user.id,
    status: user.status,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    roles: [isAdmin ? Roles.ADMIN : Roles.USER],
    isAdmin
  };
}

export function mapUsersRoles(users: User[], adminEmail: string): IUserResponse[] {
  return users.map((user) => mapUserRoles(user, adminEmail));
}
