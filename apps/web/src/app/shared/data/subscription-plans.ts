import type { IUserResponse } from '@unslop-docs/api-contracts';

export const subscriptionPlans = {
  FREE: { name: 'Free', price: 0, documents: 3, icon: 'leaf' },
  PREMIUM: { name: 'Premium', price: 7, documents: 15, icon: 'badge-check' },
  GOLD: { name: 'Gold', price: 15, documents: 35, icon: 'crown' }
} satisfies Record<IUserResponse['status'], { name: string; price: number; documents: number; icon: string }>;

export function subscriptionContactUrl(plan?: string): string {
  const message = plan
    ? `Hi Musanzi, I'd like to upgrade my Unslopy subscription to ${plan}.`
    : `Hi Musanzi, I'd like to ask about my Unslopy subscription.`;
  return `https://wa.me/2432878704?text=${encodeURIComponent(message)}`;
}
