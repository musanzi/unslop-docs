import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { disabled, email, form, FormField, minLength, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import type { IUpdateProfileDto } from '@unslop-docs/api-contracts';
import { Message } from '@web/shared/ui';
import { AuthStore } from '@web/domains/auth/shared/data-access';
import { environment } from '@web/environments/environment';
import { ProfileStore } from '@web/domains/common/modules/profile/data-access';
import { IProfileFormModel, IUpdatePasswordFormModel } from '@web/domains/common/modules/profile/interfaces';

@Component({
  imports: [FormField, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTabsModule, Message],
  templateUrl: './profile.html',
  providers: [ProfileStore]
})
export default class Profile {
  protected readonly store = inject(ProfileStore);
  protected readonly ref = inject(MatDialogRef<Profile>, { optional: true });
  protected readonly profileFormId = `${this.ref?.id ?? 'profile-page'}-editor-form`;
  protected readonly passwordFormId = `${this.ref?.id ?? 'profile-page'}-password-form`;
  private readonly auth = inject(AuthStore);
  private readonly user = this.auth.user();
  readonly isSaving = computed(
    () => this.store.isUpdatingProfile() || this.store.isUpdatingProfileImage() || this.store.isUpdatingPassword()
  );
  protected readonly selectedTabIndex = signal(0);
  protected readonly editingPassword = computed(() => this.selectedTabIndex() === 1);
  protected readonly profileImageUrl = computed(() => {
    const avatar = this.auth.user()?.avatar;
    return avatar
      ? /^https?:\/\//i.test(avatar)
        ? avatar
        : `${environment.apiUrl}/uploads/profiles/${avatar}`
      : '/images/avatar.webp';
  });
  protected readonly profileModel = signal<IProfileFormModel>({
    name: this.user?.name ?? '',
    email: this.user?.email ?? ''
  });
  protected readonly profileForm = form(this.profileModel, (fields) => {
    disabled(fields, () => this.isSaving());
    required(fields.name, { message: 'Le nom est requis.' });
    validate(fields.name, ({ value }) =>
      value().trim() ? undefined : { kind: 'required', message: 'Le nom est requis.' }
    );
    required(fields.email, { message: 'L’adresse e-mail est requise.' });
    email(fields.email, { message: 'L’adresse e-mail est invalide.' });
  });
  protected readonly passwordModel = signal<IUpdatePasswordFormModel>({ password: '', confirmPassword: '' });
  protected readonly passwordForm = form(this.passwordModel, (fields) => {
    disabled(fields, () => this.isSaving());
    required(fields.password, { message: 'Le mot de passe est requis.' });
    minLength(fields.password, 8, { message: '8 caractères minimum.' });
    required(fields.confirmPassword, { message: 'La confirmation est requise.' });
    validate(fields.confirmPassword, ({ value, valueOf }) =>
      value() === valueOf(fields.password)
        ? undefined
        : { kind: 'password-match', message: 'Les mots de passe ne correspondent pas.' }
    );
  });
  protected hidePassword = true;
  protected hidePasswordConfirmation = true;

  constructor() {
    effect(() => {
      if ((this.store.profileUpdated() || this.store.passwordUpdated()) && !this.isSaving()) this.ref?.close(true);
    });
    effect(() => {
      if (!this.ref && this.store.passwordUpdated() && !this.isSaving()) {
        untracked(() => {
          this.passwordForm().reset({ password: '', confirmPassword: '' });
          this.hidePassword = true;
          this.hidePasswordConfirmation = true;
        });
      }
    });
  }

  protected onUpdateProfile(event: Event): void {
    event.preventDefault();
    if (this.isSaving()) return;
    void submit(this.profileForm, async (state) => {
      const value = state().value();
      const payload: IUpdateProfileDto = {
        name: value.name.trim(),
        email: value.email.trim()
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

  protected onTabChange(index: number): void {
    this.selectedTabIndex.set(index);
    if (index === 1) {
      this.store.clearPasswordMessage();
      this.passwordForm().reset({ password: '', confirmPassword: '' });
      this.hidePassword = true;
      this.hidePasswordConfirmation = true;
    }
  }

  protected onUpdatePassword(event: Event): void {
    event.preventDefault();
    if (this.isSaving()) return;
    void submit(this.passwordForm, async (state) => {
      this.store.updatePassword({ password: state().value().password });
    });
  }
}
