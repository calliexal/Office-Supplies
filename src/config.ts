export const PICKUP_LOCATION = 'General Affair Office';

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim() ?? '';

export const SUPPORT_EMAIL: string | null = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail) ? supportEmail : null;
