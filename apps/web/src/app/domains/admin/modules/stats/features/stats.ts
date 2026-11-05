import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { getApiErrorMessage } from '@/app/core/api';
import { StatsService } from '@web/domains/admin/modules/stats/data-access';

@Component({
  templateUrl: './stats.html',
  imports: [DecimalPipe, MatButtonModule, MatCardModule, MatIconModule],
  providers: [StatsService]
})
export default class Stats {
  protected readonly statsResource = inject(StatsService).stats;
  protected readonly errorMessage = computed(() =>
    getApiErrorMessage(this.statsResource.error(), 'Please try again in a few moments.')
  );
}
