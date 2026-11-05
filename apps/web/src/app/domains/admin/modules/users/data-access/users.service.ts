import { httpResource } from '@angular/common/http';
import { computed, debounced, effect, linkedSignal, Service, signal } from '@angular/core';
import type { IStatusChangeResponse, IUserResponse } from '@unslop-docs/api-contracts';

import { getApiErrorMessage } from '@web/core/api';
import type { IPage } from '@web/domains/admin/shared/interfaces';

@Service()
export class UsersService {
  readonly selectedUser = signal<IUserResponse | null>(null);
  readonly history = httpResource<IStatusChangeResponse[]>(() => {
    const user = this.selectedUser();
    return user ? `/users/${user.id}/status-changes` : undefined;
  });
  readonly historyError = computed(() =>
    this.history.error()
      ? getApiErrorMessage(this.history.error(), 'Unable to load status history. Please try again.')
      : ''
  );
  readonly query = signal('');
  readonly debouncedQuery = debounced(this.query, 300);
  readonly page = linkedSignal({ source: () => this.debouncedQuery.value().trim(), computation: () => 1 });
  readonly pageSize = signal(40);
  readonly list = httpResource<IPage<IUserResponse>>(() => ({
    url: '/users',
    params: { page: this.page(), limit: this.pageSize(), q: this.debouncedQuery.value().trim() }
  }));
  readonly users = computed(() => (this.list.hasValue() ? this.list.value()[0] : []));
  readonly usersCount = computed(() => (this.list.hasValue() ? this.list.value()[1] : 0));
  readonly hasPagination = computed(() => this.usersCount() > this.pageSize() || this.page() > 1);
  readonly error = computed(() => {
    if (this.list.error()) return getApiErrorMessage(this.list.error(), 'Unable to load users. Please try again.');
    return '';
  });

  constructor() {
    effect(() => {
      if (this.list.isLoading() || !this.list.hasValue()) return;
      const lastPage = Math.max(1, Math.ceil(this.usersCount() / this.pageSize()));
      if (this.page() > lastPage) this.page.set(lastPage);
    });
  }

  applyUser(user: IUserResponse): void {
    if (this.list.hasValue()) {
      this.list.value.update(([users, total]) => [users.map((item) => (item.id === user.id ? user : item)), total]);
    }
    if (this.selectedUser()?.id === user.id) this.selectedUser.set(user);
    this.history.reload();
  }

  reload(): void {
    this.list.reload();
  }
}
