import { httpResource } from '@angular/common/http';
import { computed, Service } from '@angular/core';
import type { IRoleResponse } from '@unslop-docs/api-contracts';

import { getApiErrorMessage } from '@web/core/api';
import type { IPage } from '@web/domains/admin/shared/interfaces';

@Service()
export class RolesService {
  readonly roles = httpResource<IPage<IRoleResponse>>(() => '/roles');
  readonly items = computed(() => (this.roles.hasValue() ? this.roles.value()[0] : []));
  readonly error = computed(() =>
    this.roles.error() ? getApiErrorMessage(this.roles.error(), 'Unable to load roles. Please try again.') : ''
  );
}
