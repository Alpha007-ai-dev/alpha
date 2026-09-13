import { getTransactionDecoder } from '@solana/transactions';
import { getBase64Encoder } from '@solana/codecs-strings';

export const PLATFORM_FEE_BPS = 20;

export type PayToken = {
  key: string;
  symbol: string;
  mint: string;
  decimals: number;
  feeAccount?: string;
};

export const PAY_TOKENS: PayToken[] = [
  { key: 'usdc', symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, feeAccount: '7oUXJtg1zdvqRFSAaKHsbisaWBDjEywBzQiueqpCLgkY' },
  { key: 'sol',  symbol: 'SOL',  mint: 'So11111111111111111111111111111111111111112', decimals: 9, feeAccount: '' },
  { key: 'skr',  symbol: 'SKR',  mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', decimals: 6, feeAccount: 'DK1CsYJf9ZnQ4WmLeqZLccdZRMKdvNd1351jECQBeEMJ' },
];

export type Quote = {
  raw: any;
  outUi: number;
  feeUi: number;
  feeBps: number;
  feeSymbol: string;
  priceImpactPct: number;
  slippageBps: number;
  contextSlot: number;
  outSymbol?: string;
  paySymbol: string;
  feeAccount?: string;
};

export async function getQuote(
  pay: PayToken,
  payAmount: number,
  outputMint: string,
  outDecimals: number,
  outSymbol?: string
): Promise<Quote | null> {
  try {
    if (pay.mint === outputMint) return null;
    const amount = Math.round(payAmount * Math.pow(10, pay.decimals));
    const useFee = !!pay.feeAccount;

    const url =
      'https://lite-api.jup.ag/swap/v1/quote' +
      '?inputMint=' + pay.mint +
      '&outputMint=' + outputMint +
      '&amount=' + amount +
      '&slippageBps=50' +
      (useFee ? '&platformFeeBps=' + PLATFORM_FEE_BPS : '');

    const r = await fetch(url);
    const q = await r.json();
    if (!q || q.error || !q.outAmount) return null;

    const feeRaw = Number(q.platformFee?.amount ?? 0);
    const feeUi = feeRaw / Math.pow(10, pay.decimals);

    return {
      raw: q,
      outUi: Number(q.outAmount) / Math.pow(10, outDecimals),
      feeUi,
      feeBps: Number(q.platformFee?.feeBps ?? 0),
      feeSymbol: pay.symbol,
      priceImpactPct: Number(q.priceImpactPct ?? 0),
      slippageBps: Number(q.slippageBps ?? 50),
      contextSlot: Number(q.contextSlot ?? 0),
      outSymbol,
      paySymbol: pay.symbol,
      feeAccount: pay.feeAccount,
    };
  } catch {
    return null;
  }
}

export async function buildSwapTx(quote: Quote, userPublicKey: string): Promise<string | null> {
  try {
    const body: any = {
      quoteResponse: quote.raw,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    };
    if (quote.feeAccount) body.feeAccount = quote.feeAccount;

    const r = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j?.swapTransaction) { console.log('JUP SWAP ERROR', JSON.stringify(j)); return null; }
    return j.swapTransaction as string;
  } catch (e) {
    console.log('JUP SWAP EXCEPTION', String(e));
    return null;
  }
}

export function decodeTx(base64: string) {
  const bytes = getBase64Encoder().encode(base64);
  return getTransactionDecoder().decode(bytes);
}

export function fmtAmount(n: number): string {
  if (!isFinite(n)) return '--';
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(3);
}
