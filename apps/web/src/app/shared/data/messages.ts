import { IMessageType, IMessageStyle } from '@web/shared/interfaces';

export const MESSAGE_STYLES: Record<IMessageType, IMessageStyle> = {
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    iconContainer: 'bg-emerald-100 text-emerald-700',
    message: 'text-emerald-800',
    dismiss: 'text-emerald-700',
    icon: 'circle-check',
    defaultTitle: 'Operation successful'
  },
  error: {
    container: 'border-error-200 bg-error-50 text-error-950',
    iconContainer: 'bg-error-100 text-error-700',
    message: 'text-error-800',
    dismiss: 'text-error-700',
    icon: 'circle-x',
    defaultTitle: 'An error occurred'
  },
  warning: {
    container: 'border-amber-200 bg-amber-50 text-amber-950',
    iconContainer: 'bg-amber-100 text-amber-700',
    message: 'text-amber-800',
    dismiss: 'text-amber-700',
    icon: 'triangle-alert',
    defaultTitle: 'Warning'
  }
};
