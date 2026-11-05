import { Component, computed, effect, inject, signal } from '@angular/core';
import { disabled, form, FormField, required, submit, validate } from '@angular/forms/signals';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { IUpdateProfileDto } from '@unslop-docs/api-contracts';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { environment } from '@web/environments/environment';
import { ProfileStore } from '@web/domains/common/modules/profile/data-access';
import { IProfileFormModel } from '@web/domains/common/modules/profile/interfaces';

@Component({
  imports: [FormField, MatIconModule],
  templateUrl: './profile.html',
  providers: [ProfileStore]
})
export default class Profile {
  protected readonly store = inject(ProfileStore);
  protected readonly ref = inject(MatDialogRef<Profile>);
  protected readonly profileFormId = `${this.ref.id}-editor-form`;
  private readonly auth = inject(AuthStore);
  protected readonly user = this.auth.user();
  readonly isSaving = computed(() => this.store.isUpdatingProfile() || this.store.isUpdatingProfileImage());
  protected readonly profileImageUrl = computed(() => {
    const avatar = this.auth.user()?.avatar;
    return avatar
      ? /^https?:\/\//i.test(avatar)
        ? avatar
        : `${environment.apiUrl}/uploads/profiles/${avatar}`
      : '/images/avatar.webp';
  });
  protected readonly profileModel = signal<IProfileFormModel>({
    name: this.user?.name ?? ''
  });
  protected readonly profileForm = form(this.profileModel, (fields) => {
    disabled(fields, () => this.isSaving());
    required(fields.name, { message: 'Name is required.' });
    validate(fields.name, ({ value }) =>
      value().trim() ? undefined : { kind: 'required', message: 'Name is required.' }
    );
  });
  constructor() {
    effect(() => {
      if (this.store.profileUpdated() && !this.isSaving()) this.ref.close(true);
    });
  }

  protected onUpdateProfile(event: Event): void {
    event.preventDefault();
    if (this.isSaving()) return;
    void submit(this.profileForm, async (state) => {
      const value = state().value();
      const payload: IUpdateProfileDto = {
        name: value.name.trim()
      };
      this.store.updateProfile(payload);
    });
  }

  protected onProfileImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const image = input.files?.[0];
    if (image && !this.isSaving()) this.store.updateProfileImage(image);
    input.value = '';
  }
}
