export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;
export const PLATFORM_FEE_BPS = 20;

export type Quote = {
  raw: any;
  inAmount: string;
  outAmount: string;
  outUi: number;
  feeAmount: string;
  feeUi: number;
  feeBps: number;
  priceImpactPct: number;
  slippageBps: number;
  contextSlot: number;
  outDecimals: number;
  outSymbol?: string;
};

export async function getQuote(
  outputMint: string,
  usdcAmount: number,
  outDecimals: number,
  outSymbol?: string
): Promise<Quote | null> {
  try {
    const amount = Math.round(usdcAmount * Math.pow(10, USDC_DECIMALS));
    const url =
      'https://lite-api.jup.ag/swap/v1/quote' +
      '?inputMint=' + USDC +
      '&outputMint=' + outputMint +
      '&amount=' + amount +
      '&slippageBps=50' +
      '&platformFeeBps=' + PLATFORM_FEE_BPS;

    const r = await fetch(url);
    const q = await r.json();
    if (!q || q.error || !q.outAmount) return null;

    const feeAmount = String(q.platformFee?.amount ?? '0');
    const div = Math.pow(10, outDecimals);

    return {
      raw: q,
      inAmount: String(q.inAmount),
      outAmount: String(q.outAmount),
      outUi: Number(q.outAmount) / div,
      feeAmount,
      feeUi: Number(feeAmount) / div,
      feeBps: Number(q.platformFee?.feeBps ?? PLATFORM_FEE_BPS),
      priceImpactPct: Number(q.priceImpactPct ?? 0),
      slippageBps: Number(q.slippageBps ?? 50),
      contextSlot: Number(q.contextSlot ?? 0),
      outDecimals,
      outSymbol,
    };
  } catch {
    return null;
  }
}

export function fmtAmount(n: number): string {
  if (!isFinite(n)) return '--';
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(3);
}
