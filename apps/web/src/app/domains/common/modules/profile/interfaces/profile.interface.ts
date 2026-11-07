export interface IProfileFormModel {
  name: string;
}

export interface IProfileState {
  isUpdatingProfile: boolean;
  isUpdatingProfileImage: boolean;
  profileUpdated: boolean;
  profileImageUpdated: boolean;
  profileError: string;
  profileImageError: string;
}
