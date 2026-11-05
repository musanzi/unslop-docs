import type { ICreateUserDto, IUpdatePasswordDto } from '@unslop-docs/api-contracts';

export type IProfileFormModel = Pick<ICreateUserDto, 'name' | 'email'>;

export type IUpdatePasswordFormModel = IUpdatePasswordDto & {
  confirmPassword: string;
};

export interface IProfileState {
  isUpdatingProfile: boolean;
  isUpdatingProfileImage: boolean;
  isUpdatingPassword: boolean;
  profileUpdated: boolean;
  profileImageUpdated: boolean;
  passwordUpdated: boolean;
  profileError: string;
  profileImageError: string;
  passwordError: string;
}
