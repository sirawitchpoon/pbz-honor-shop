const loggerUrl = (process.env.BOTS_LOGGER_URL ?? '').replace(/\/$/, '');
const loggerApiKey = process.env.BOTS_LOGGER_API_KEY ?? '';

export type ShopLogCategory = 'shop' | 'purchase' | 'balance' | 'admin';

export function isBotsLoggerEnabled(): boolean {
  return Boolean(loggerUrl && loggerApiKey);
}

export async function logShopAction(payload: {
  userId: string;
  username?: string;
  category?: ShopLogCategory;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  if (!isBotsLoggerEnabled()) return;

  try {
    await fetch(`${loggerUrl}/api/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': loggerApiKey,
      },
      body: JSON.stringify({
        botId: 'honor-shop-bot',
        category: payload.category ?? 'shop',
        action: payload.action,
        userId: payload.userId,
        username: payload.username,
        details: payload.details,
      }),
    });
  } catch {
    // Non-critical
  }
}
