const supabaseUrl = process.env.SUPABASE_URL || 'https://ucvutimcfthupaljoxdp.supabase.co';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ZNgikya1HBy67qA7NSdFYA_zLmdc-9N';
const allowedOrigins = new Set(
  (process.env.PDV_ALLOWED_ORIGINS || 'https://pdv-dom-frios.vercel.app,http://localhost:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

export function isOriginAllowed(origin: string | undefined) {
  return Boolean(origin && allowedOrigins.has(origin));
}

export async function validateAccessToken(token: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Object.assign(new Error('Sessão inválida ou expirada.'), { code: 'UNAUTHORIZED' });
  const user = (await response.json()) as { id?: string };
  if (!user.id) throw Object.assign(new Error('Sessão inválida.'), { code: 'UNAUTHORIZED' });
  return user.id;
}

export function corsHeaders(origin: string | undefined) {
  if (!origin || !isOriginAllowed(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    Vary: 'Origin',
  };
}
