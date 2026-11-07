import { booleanAttribute, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MESSAGE_STYLES } from '@web/shared/data';
import { IMessageType } from '@web/shared/interfaces';

@Component({
  selector: 'message',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './message.html',
  host: { class: 'block' }
})
export class Message {
  type = input<IMessageType>('error');
  title = input('');
  message = input.required<string>();
  dismissible = input(true, { transform: booleanAttribute });
  dismissed = output<void>();

  protected styles = computed(() => MESSAGE_STYLES[this.type()]);
  protected displayedTitle = computed(() => this.title() || this.styles().defaultTitle);
  protected role = computed(() => (this.type() === 'error' ? 'alert' : 'status'));
  protected ariaLive = computed(() => (this.type() === 'error' ? 'assertive' : 'polite'));
}
