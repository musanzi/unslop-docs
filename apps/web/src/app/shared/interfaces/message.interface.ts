export type IMessageType = 'success' | 'error' | 'warning';

export interface IMessageStyle {
  container: string;
  iconContainer: string;
  message: string;
  dismiss: string;
  icon: string;
  defaultTitle: string;
}
