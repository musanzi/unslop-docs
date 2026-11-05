import type { IUserResponse } from '@unslop-docs/api-contracts';

export interface IAuthState {
  user: IUserResponse | null;
  isSigningOut: boolean;
  signOutError: string;
}
