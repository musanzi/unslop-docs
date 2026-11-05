import { HttpClient, httpResource } from '@angular/common/http';
import { computed, effect, inject, linkedSignal, Service, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { IStatusChangeResponse, IUpdateStatusDto, IUserResponse } from '@unslop-docs/api-contracts';
import { getApiErrorMessage } from '@web/core/api';

@Service()
export class UserDetailStore {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly http = inject(HttpClient);
  readonly id = computed(() => this.params().get('id'));
  readonly user = httpResource<IUserResponse>(() =>
    this.id() ? `/users/by-id/${encodeURIComponent(this.id()!)}` : undefined
  );
  readonly history = httpResource<IStatusChangeResponse[]>(() =>
    this.user.hasValue() ? `/users/${this.user.value().id}/status-changes` : undefined
  );
  readonly status = linkedSignal<IUpdateStatusDto['status']>(() =>
    this.user.hasValue() ? this.user.value().status : 'FREE'
  );
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly saved = signal('');
  readonly error = computed(() =>
    this.user.error() ? getApiErrorMessage(this.user.error(), 'Unable to load this user. Please try again.') : ''
  );
  readonly historyError = computed(() =>
    this.history.error()
      ? getApiErrorMessage(this.history.error(), 'Unable to load status history. Please try again.')
      : ''
  );

  constructor() {
    effect(() => {
      this.id();
      this.saveError.set('');
      this.saved.set('');
    });
  }

  async save(): Promise<void> {
    if (this.saving() || !this.user.hasValue() || this.status() === this.user.value().status) return;
    const id = this.id();
    this.saving.set(true);
    this.saveError.set('');
    this.saved.set('');
    try {
      const user = await firstValueFrom(
        this.http.patch<IUserResponse>(`/users/${id}/status`, { status: this.status() })
      );
      if (this.id() === id) {
        this.user.set(user);
        this.history.reload();
        this.saved.set(`Status saved as ${user.status}.`);
      }
    } catch (error) {
      if (this.id() === id) this.saveError.set(getApiErrorMessage(error, 'Unable to change status. Please try again.'));
    } finally {
      this.saving.set(false);
    }
  }
}
