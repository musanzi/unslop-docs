import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApiErrorMessage } from '@web/core/api';
import { StatsService } from '../data-access';

@Component({ templateUrl: './stats.html', imports: [DecimalPipe, RouterLink], providers: [StatsService] })
export default class Stats {
  protected readonly statsResource = inject(StatsService).stats;
  protected readonly errorMessage = computed(() =>
    getApiErrorMessage(this.statsResource.error(), 'Unable to load statistics. Please try again.')
  );
}
