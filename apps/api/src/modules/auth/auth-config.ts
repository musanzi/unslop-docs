export function validateAuthConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (typeof config.ADMIN_EMAIL !== 'string' || !config.ADMIN_EMAIL.trim()) {
    throw new Error('ADMIN_EMAIL is required: set it to the verified Google email of the administrator');
  }
  return { ...config, ADMIN_EMAIL: config.ADMIN_EMAIL.trim() };
}
