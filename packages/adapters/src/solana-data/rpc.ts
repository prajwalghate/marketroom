/**
 * Solana JSON-RPC, read-only: what a program is, who can change it, and how
 * busy it has been.
 *
 * Two public nodes, verified 2026-10-10, with opposite strengths:
 *
 *  - `solana-rpc.publicnode.com` is fast and generous, but keeps only about a
 *    day (~24.6 h) of transaction history. It answers some default user
 *    agents with HTTP 403, so every request here names itself.
 *  - `api.mainnet-beta.solana.com` has the full history, but allows about ten
 *    `getSignaturesForAddress` calls per ten seconds and answers HTTP 429 with
 *    `retry-after` beyond that. It is asked one question at a time, at most
 *    once a second, and only what the first node cannot answer.
 *
 * Accounts are read with `dataSlice`. On the original loaders a program's
 * account *is* its executable — hundreds of kilobytes — and everything wanted
 * here lives in its first 48 bytes. They are read ten to a request: the
 * standard limit is 100, but publicnode answers HTTP 403 "Request blocked" to
 * `getMultipleAccounts` with eleven or more (verified 2026-10-10).
 */

import { fetchJson, HttpResponseError } from '../http';

export const PUBLIC_RPC = 'https://solana-rpc.publicnode.com';
export const HISTORY_RPC = 'https://api.mainnet-beta.solana.com';

/** How every importer request introduces itself. Some public endpoints refuse anonymous agents. */
export const USER_AGENT = 'Marketroom/0.1 (Solana research importer)';

export const LOADER_UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
export const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
export const LOADER_V1 = 'BPFLoader1111111111111111111111111111111111';
export const LOADER_V4 = 'LoaderV411111111111111111111111111111111111';

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58, as Solana writes addresses. Leading zero bytes become leading '1's. */
export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  // Base-58 digits, least significant first: long division, one byte at a time.
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]!];
  return out;
}

export function base58Decode(text: string): Uint8Array {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros += 1;
  const bytes: number[] = []; // least significant first
  for (let i = zeros; i < text.length; i += 1) {
    let carry = ALPHABET.indexOf(text[i]!);
    if (carry < 0) throw new Error(`Not base58: ${text}`);
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) out[out.length - 1 - i] = bytes[i]!;
  return out;
}

/** Whether a string is a Solana address: base58 for exactly 32 bytes. */
export function isAddress(text: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  try {
    return base58Decode(text).length === 32;
  } catch {
    return false;
  }
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Program accounts
// ---------------------------------------------------------------------------

/** `upgradeable` while someone can still change the code; `immutable` once nobody can. */
export type LoaderKind = 'upgradeable' | 'immutable' | 'unknown';

export interface ProgramAccount {
  /** The loader that owns the account. */
  readonly owner: string;
  readonly loader: LoaderKind;
  readonly programDataAddress: string | null;
  readonly upgradeAuthority: string | null;
  readonly lastDeploySlot: number | null;
}

const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);

/**
 * What a program account says about itself, from its first 48 bytes.
 *
 *  - Upgradeable loader: a 4-byte tag (2 = Program) and the address of the
 *    ProgramData account, which holds the last deploy slot and the upgrade
 *    authority — see `decodeProgramData`. Until that is read, the program is
 *    only *probably* upgradeable.
 *  - Loader v4: the deploy slot, an authority and a status in the account
 *    itself. A finalized program can never change; its 32 bytes then point at
 *    a next version rather than naming an authority.
 *  - Loaders 1 and 2: there is no authority. The code is fixed at deploy.
 */
export function decodeProgramAccount(owner: string, data: Uint8Array): ProgramAccount {
  const none = { owner, programDataAddress: null, upgradeAuthority: null, lastDeploySlot: null };
  if (owner === LOADER_V1 || owner === LOADER_V2) return { ...none, loader: 'immutable' };
  if (owner === LOADER_UPGRADEABLE) {
    if (data.length < 36 || view(data).getUint32(0, true) !== 2)
      return { ...none, loader: 'unknown' };
    return {
      ...none,
      loader: 'upgradeable',
      programDataAddress: base58Encode(data.subarray(4, 36)),
    };
  }
  if (owner === LOADER_V4) {
    if (data.length < 48) return { ...none, loader: 'unknown' };
    const slot = Number(view(data).getBigUint64(0, true));
    const status = Number(view(data).getBigUint64(40, true)); // 0 retracted, 1 deployed, 2 finalized
    if (status === 2) return { ...none, loader: 'immutable', lastDeploySlot: slot };
    return {
      ...none,
      loader: 'upgradeable',
      upgradeAuthority: base58Encode(data.subarray(8, 40)),
      lastDeploySlot: slot,
    };
  }
  // Not a program at all — a registry listed something else.
  return { ...none, loader: 'unknown' };
}

export interface ProgramData {
  readonly lastDeploySlot: number;
  /** `null` once the authority has been revoked: the program can no longer change. */
  readonly upgradeAuthority: string | null;
}

/**
 * An upgradeable program's ProgramData header: a 4-byte tag (3), the slot of
 * the last deploy (u64), then an optional authority — one byte saying
 * whether it is present, and its 32 bytes.
 */
export function decodeProgramData(data: Uint8Array): ProgramData | null {
  if (data.length < 13 || view(data).getUint32(0, true) !== 3) return null;
  const lastDeploySlot = Number(view(data).getBigUint64(4, true));
  if (data[12] === 0) return { lastDeploySlot, upgradeAuthority: null };
  if (data[12] !== 1 || data.length < 45) return null;
  return { lastDeploySlot, upgradeAuthority: base58Encode(data.subarray(13, 45)) };
}

/** A program account completed with its ProgramData, when it has one. */
export function withProgramData(
  account: ProgramAccount,
  programData: ProgramData | null | undefined,
): ProgramAccount {
  if (!account.programDataAddress) return account;
  // A program whose ProgramData is gone has been closed: it cannot run, and
  // nothing about its authority can be read.
  if (!programData) return { ...account, loader: 'unknown' };
  return {
    ...account,
    loader: programData.upgradeAuthority ? 'upgradeable' : 'immutable',
    upgradeAuthority: programData.upgradeAuthority,
    lastDeploySlot: programData.lastDeploySlot,
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly method: string,
  ) {
    super(`${method}: ${message} (${code})`);
    this.name = 'RpcError';
  }
}

export interface SignatureInfo {
  readonly signature: string;
  readonly slot: number;
  /** Unix seconds; `null` when the node does not know. */
  readonly blockTime: number | null;
  readonly failed: boolean;
}

export interface RawAccount {
  readonly owner: string;
  readonly executable: boolean;
  readonly data: Uint8Array;
}

export interface RpcOptions {
  readonly signal?: AbortSignal;
  /** Minimum time between the starts of two requests. 0: no pacing. */
  readonly minIntervalMs?: number;
  readonly timeoutMs?: number;
  /** Transport retries per request (see `http.ts`). A node that rate-limits wants 0. */
  readonly retries?: number;
  /** Addresses per `getMultipleAccounts`. Ten suits every node tried; most allow 100. */
  readonly accountsPerRequest?: number;
}

interface WireSignature {
  signature: string;
  slot: number;
  blockTime?: number | null;
  err?: unknown;
}

interface WireAccount {
  owner: string;
  executable: boolean;
  data: [string, string];
}

const abortError = (signal: AbortSignal) =>
  signal.reason instanceof Error
    ? signal.reason
    : Object.assign(new Error('Aborted'), { name: 'AbortError' });

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** `retry-after` in milliseconds: seconds, or an HTTP date. */
export function retryAfterMs(headers: Headers, nowMs = Date.now()): number | null {
  const value = headers.get('retry-after')?.trim();
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null;
}

export class SolanaRpc {
  /** The node's hostname — what activity snapshots name as their provider. */
  readonly host: string;
  private nextAt = 0;
  private id = 0;

  constructor(
    readonly url: string,
    private readonly options: RpcOptions = {},
  ) {
    let host = 'Solana RPC';
    try {
      host = new URL(url).hostname;
    } catch {
      // Keep the generic label.
    }
    this.host = host;
  }

  /** Reserve the next start slot. Synchronous, so concurrent callers queue too. */
  private async pace() {
    const interval = this.options.minIntervalMs ?? 0;
    if (!interval) return;
    const now = Date.now();
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + interval;
    if (at > now) await sleep(at - now, this.options.signal);
  }

  async call<T>(method: string, params: readonly unknown[]): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      await this.pace();
      try {
        const response = await fetchJson<{
          result?: T;
          error?: { code?: number; message?: string };
        }>(this.url, {
          json: { jsonrpc: '2.0', id: (this.id += 1), method, params },
          headers: { 'User-Agent': USER_AGENT },
          signal: this.options.signal,
          timeoutMs: this.options.timeoutMs ?? 30_000,
          retries: this.options.retries ?? 2,
        });
        const body = response.data;
        if (!body) throw new RpcError(-1, 'empty response', method);
        if (body.error) {
          throw new RpcError(body.error.code ?? -1, body.error.message ?? 'error', method);
        }
        return body.result as T;
      } catch (error) {
        // A node that says "slow down" says for how long. Wait once, as told;
        // a second refusal means the budget is spent, and the caller decides.
        if (error instanceof HttpResponseError && error.status === 429 && attempt === 0) {
          await sleep(Math.min(retryAfterMs(error.headers) ?? 10_000, 30_000), this.options.signal);
          continue;
        }
        throw error;
      }
    }
  }

  /** Owners and the first `length` bytes of many accounts; `null` where none exists. */
  async accounts(addresses: readonly string[], length: number): Promise<(RawAccount | null)[]> {
    const out: (RawAccount | null)[] = [];
    const size = Math.min(100, Math.max(1, this.options.accountsPerRequest ?? 10));
    for (let i = 0; i < addresses.length; i += size) {
      const chunk = addresses.slice(i, i + size);
      const result = await this.call<{ value?: (WireAccount | null)[] }>('getMultipleAccounts', [
        chunk,
        { encoding: 'base64', dataSlice: { offset: 0, length } },
      ]);
      const values = result?.value ?? [];
      for (let j = 0; j < chunk.length; j += 1) {
        const v = values[j];
        out.push(
          v ? { owner: v.owner, executable: v.executable, data: fromBase64(v.data[0]) } : null,
        );
      }
    }
    return out;
  }

  /**
   * An address's most recent signatures, newest first.
   *
   * `finalized` (the node's default) trails the chain by ~8 s; `confirmed` by
   * ~1 s. For the busiest programs a thousand signatures span only a few
   * seconds, so a rate measured to "now" needs the fresher view.
   */
  async signatures(
    address: string,
    limit: number,
    options: { commitment?: 'confirmed' | 'finalized' } = {},
  ): Promise<SignatureInfo[]> {
    const result = await this.call<WireSignature[] | null>('getSignaturesForAddress', [
      address,
      { limit, ...(options.commitment ? { commitment: options.commitment } : {}) },
    ]);
    return (result ?? []).map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: typeof s.blockTime === 'number' ? s.blockTime : null,
      failed: s.err !== null && s.err !== undefined,
    }));
  }

  /**
   * When this node's history starts, in unix ms — the time of its first
   * available block. `null` if it cannot say.
   */
  async historyStart(): Promise<number | null> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const slot = await this.call<number>('getFirstAvailableBlock', []);
      try {
        // A pruning node can drop that block between the two calls; a few
        // hundred slots later (a few minutes) is still the start, near enough.
        const time = await this.call<number | null>('getBlockTime', [slot + attempt * 500]);
        return typeof time === 'number' ? time * 1000 : null;
      } catch (error) {
        if (!(error instanceof RpcError) || attempt === 1) throw error;
      }
    }
    return null;
  }
}

/**
 * Loader, authority and last deploy for many programs, in two batched reads:
 * the program accounts, then the ProgramData accounts they point at. A
 * program missing from the chain maps to `null`.
 */
export async function readPrograms(
  rpc: SolanaRpc,
  addresses: readonly string[],
): Promise<Map<string, ProgramAccount | null>> {
  const accounts = await rpc.accounts(addresses, 48);
  const decoded = new Map<string, ProgramAccount | null>();
  addresses.forEach((address, i) => {
    const account = accounts[i];
    decoded.set(address, account ? decodeProgramAccount(account.owner, account.data) : null);
  });

  const dataAddresses = [
    ...new Set(
      [...decoded.values()]
        .map((d) => d?.programDataAddress)
        .filter((a): a is string => typeof a === 'string'),
    ),
  ];
  const dataAccounts = dataAddresses.length ? await rpc.accounts(dataAddresses, 45) : [];
  const programData = new Map<string, ProgramData | null>();
  dataAddresses.forEach((address, i) => {
    const account = dataAccounts[i];
    programData.set(
      address,
      account && account.owner === LOADER_UPGRADEABLE ? decodeProgramData(account.data) : null,
    );
  });

  const out = new Map<string, ProgramAccount | null>();
  for (const [address, account] of decoded) {
    out.set(
      address,
      account && account.programDataAddress
        ? withProgramData(account, programData.get(account.programDataAddress))
        : account,
    );
  }
  return out;
}
