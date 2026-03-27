const baseUrl = (process.env.HONOR_POINTS_API_URL ?? '').replace(/\/$/, '');
const apiKey = process.env.HONOR_POINTS_API_KEY ?? '';
const useTestMode = process.env.USE_TEST_HONOR_POINTS === 'true';
const testBalance = parseInt(process.env.TEST_HONOR_POINTS_BALANCE || '10000', 10);

const testWallets = new Map<string, number>();

function getTestBalance(userId: string): number {
  if (!testWallets.has(userId)) {
    testWallets.set(userId, testBalance);
  }
  return testWallets.get(userId)!;
}

interface PointsResult {
  success: boolean;
  honorPoints: number;
  username?: string | null;
  error?: string;
}

export function isHonorPointsConfigured(): boolean {
  if (useTestMode) return true;
  return Boolean(baseUrl && apiKey);
}

export function isTestMode(): boolean {
  return useTestMode;
}

export async function getBalance(userId: string): Promise<PointsResult> {
  if (useTestMode) {
    return { success: true, honorPoints: getTestBalance(userId) };
  }

  if (!baseUrl || !apiKey) {
    return { success: false, honorPoints: 0, error: 'Honor Points API not configured' };
  }

  try {
    const res = await fetch(`${baseUrl}/api/users/${userId}/points`, {
      headers: { 'X-API-Key': apiKey },
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) return { success: false, honorPoints: 0, error: data.error ?? res.statusText };
    return {
      success: true,
      honorPoints: data.honorPoints ?? 0,
      username: data.username,
    };
  } catch (e) {
    return { success: false, honorPoints: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deductPoints(params: {
  userId: string;
  amount: number;
  username?: string;
}): Promise<PointsResult> {
  if (useTestMode) {
    const bal = getTestBalance(params.userId);
    if (bal < params.amount) {
      return { success: false, honorPoints: bal, error: 'Insufficient balance' };
    }
    const newBal = bal - params.amount;
    testWallets.set(params.userId, newBal);
    return { success: true, honorPoints: newBal };
  }

  if (!baseUrl || !apiKey) {
    return { success: false, honorPoints: 0, error: 'Honor Points API not configured' };
  }

  try {
    const res = await fetch(`${baseUrl}/api/users/${params.userId}/points/deduct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ amount: params.amount }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return {
        success: false,
        honorPoints: data.currentPoints ?? 0,
        error: data.error ?? res.statusText,
      };
    }
    return { success: true, honorPoints: data.honorPoints ?? 0 };
  } catch (e) {
    return { success: false, honorPoints: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addPoints(params: {
  userId: string;
  amount: number;
  username?: string;
}): Promise<PointsResult> {
  if (useTestMode) {
    const bal = getTestBalance(params.userId) + params.amount;
    testWallets.set(params.userId, bal);
    return { success: true, honorPoints: bal };
  }

  if (!baseUrl || !apiKey) {
    return { success: false, honorPoints: 0, error: 'Honor Points API not configured' };
  }

  try {
    const res = await fetch(`${baseUrl}/api/users/${params.userId}/points/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ amount: params.amount, username: params.username }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) return { success: false, honorPoints: 0, error: data.error ?? res.statusText };
    return { success: true, honorPoints: data.honorPoints ?? 0 };
  } catch (e) {
    return { success: false, honorPoints: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
