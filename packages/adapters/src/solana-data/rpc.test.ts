import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  base58Decode,
  base58Encode,
  decodeProgramAccount,
  decodeProgramData,
  fromBase64,
  isAddress,
  LOADER_UPGRADEABLE,
  LOADER_V2,
  LOADER_V4,
  readPrograms,
  retryAfterMs,
  RpcError,
  SolanaRpc,
  withProgramData,
} from './rpc';

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));

// Expected values below were computed independently, with Python's integer arithmetic.
describe('base58', () => {
  it('encodes and decodes Solana addresses', () => {
    const jup = hex('0479d55bf231c06eee74c56ece681507fdb1b2dea3f48e5102b1cda256bc138f');
    expect(base58Encode(jup)).toBe('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
    expect(base58Decode('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')).toEqual(jup);
  });

  it('writes leading zero bytes as leading ones', () => {
    expect(base58Encode(new Uint8Array(32))).toBe('11111111111111111111111111111111');
    expect(base58Encode(Uint8Array.from([0, 0, 1, ...new Array(29).fill(0)]))).toBe(
      '11Cd4BX7vopdUjCBe56dfR9Mw86iDpdcAZbJ2yE8jR',
    );
    expect(base58Encode(Uint8Array.from([0, 0, 0, 1]))).toBe('1112');
    expect(base58Encode(Uint8Array.from([0]))).toBe('1');
    expect(base58Encode(new Uint8Array())).toBe('');
    expect(base58Decode('1112')).toEqual(Uint8Array.from([0, 0, 0, 1]));
  });

  it('round-trips arbitrary bytes', () => {
    for (let n = 0; n < 50; n += 1) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + n * 31) % 256);
      expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
    }
  });

  it('recognises addresses', () => {
    expect(isAddress('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')).toBe(true);
    expect(isAddress(LOADER_UPGRADEABLE)).toBe(true);
    expect(isAddress('not-a-program')).toBe(false);
    expect(isAddress('0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl')).toBe(false);
    expect(isAddress('abc')).toBe(false);
  });
});

describe('program accounts', () => {
  it('decodes a live ProgramData header: last deploy slot and upgrade authority', () => {
    // getAccountInfo(…, { encoding: 'base64', dataSlice: { offset: 0, length: 45 } }), 2026-10-10.
    const response = JSON.parse(fixture('programdata.json')) as {
      result: { value: { data: [string, string] } };
    };
    expect(decodeProgramData(fromBase64(response.result.value.data[0]))).toEqual({
      lastDeploySlot: 454465850,
      upgradeAuthority: 'CvQZZ23qYDWF2RUpxYJ8y9K4skmuvYEEjH7fK58jtipQ',
    });
  });

  it('reads a revoked authority as none', () => {
    const data = fromBase64('AwAAAACj4REAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(decodeProgramData(data)).toEqual({ lastDeploySlot: 300000000, upgradeAuthority: null });
  });

  it('refuses data that is not a ProgramData account', () => {
    expect(decodeProgramData(new Uint8Array(45))).toBeNull();
    expect(decodeProgramData(Uint8Array.from([3, 0, 0, 0]))).toBeNull();
  });

  it('finds an upgradeable program’s ProgramData address', () => {
    const data = fromBase64('AgAAADAPUGBbvrcwh4nmwPvj5KNgIENvbqDK2oAmDbRv9mCE');
    expect(decodeProgramAccount(LOADER_UPGRADEABLE, data)).toEqual({
      owner: LOADER_UPGRADEABLE,
      loader: 'upgradeable',
      programDataAddress: '4Ec7ZxZS6Sbdg5UGSLHbAnM7GQHp2eFd4KYWRexAipQT',
      upgradeAuthority: null,
      lastDeploySlot: null,
    });
  });

  it('settles upgradeability from the ProgramData', () => {
    const account = decodeProgramAccount(
      LOADER_UPGRADEABLE,
      fromBase64('AgAAADAPUGBbvrcwh4nmwPvj5KNgIENvbqDK2oAmDbRv9mCE'),
    );
    expect(withProgramData(account, { lastDeploySlot: 7, upgradeAuthority: null })).toMatchObject({
      loader: 'immutable',
      upgradeAuthority: null,
      lastDeploySlot: 7,
    });
    expect(withProgramData(account, { lastDeploySlot: 7, upgradeAuthority: 'X' })).toMatchObject({
      loader: 'upgradeable',
      upgradeAuthority: 'X',
    });
    // ProgramData closed: the program cannot run, and nothing can be said about it.
    expect(withProgramData(account, null).loader).toBe('unknown');
  });

  it('reads loader v4 state, and treats a finalized program as immutable', () => {
    const deployed = fromBase64('Fc1bBwAAAAAEedVb8jHAbu50xW7OaBUH/bGy3qP0jlECsc2iVrwTjwEAAAAAAAAA');
    expect(decodeProgramAccount(LOADER_V4, deployed)).toMatchObject({
      loader: 'upgradeable',
      upgradeAuthority: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      lastDeploySlot: 123456789,
    });
    const finalized = fromBase64(
      'KgAAAAAAAAAEedVb8jHAbu50xW7OaBUH/bGy3qP0jlECsc2iVrwTjwIAAAAAAAAA',
    );
    expect(decodeProgramAccount(LOADER_V4, finalized)).toMatchObject({
      loader: 'immutable',
      upgradeAuthority: null,
      lastDeploySlot: 42,
    });
  });

  it('knows the old loaders cannot upgrade, and that anything else is not a program', () => {
    expect(decodeProgramAccount(LOADER_V2, new Uint8Array(48)).loader).toBe('immutable');
    expect(decodeProgramAccount('11111111111111111111111111111111', new Uint8Array(0)).loader).toBe(
      'unknown',
    );
  });
});

describe('retry-after', () => {
  it('reads seconds and HTTP dates', () => {
    expect(retryAfterMs(new Headers({ 'retry-after': '10' }))).toBe(10_000);
    const now = Date.UTC(2026, 9, 10, 12, 0, 0);
    expect(retryAfterMs(new Headers({ 'retry-after': 'Sat, 10 Oct 2026 12:00:05 GMT' }), now)).toBe(
      5_000,
    );
    expect(retryAfterMs(new Headers())).toBeNull();
  });
});

describe('SolanaRpc', () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  const rpcResponse = (result: unknown) =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });

  it('names itself, and raises JSON-RPC errors as RpcError', async () => {
    let agent: string | null = null;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      agent = new Headers(init.headers).get('user-agent');
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32602, message: 'Invalid param' },
        }),
      );
    }) as typeof fetch;
    const rpc = new SolanaRpc('https://rpc.example.test', { retries: 0 });
    await expect(rpc.signatures('x', 10)).rejects.toBeInstanceOf(RpcError);
    expect(agent).toMatch(/Marketroom/);
    expect(rpc.host).toBe('rpc.example.test');
  });

  it('waits as long as a 429 says, once, then carries on', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1)
        return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
      return rpcResponse([
        { signature: 's', slot: 1, blockTime: 100, err: { InstructionError: [] } },
      ]);
    }) as typeof fetch;
    const rpc = new SolanaRpc('https://rpc.example.test', { retries: 0 });
    expect(await rpc.signatures('x', 1)).toEqual([
      { signature: 's', slot: 1, blockTime: 100, failed: true },
    ]);
    expect(calls).toBe(2);
  });

  it('asks for at most ten accounts per request, the most publicnode accepts', async () => {
    const sizes: number[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { params: [string[]] };
      sizes.push(body.params[0].length);
      return rpcResponse({ value: body.params[0].map(() => null) });
    }) as typeof fetch;
    const addresses = Array.from({ length: 25 }, (_, i) => `Addr${i}`);
    const accounts = await new SolanaRpc('https://rpc.example.test', { retries: 0 }).accounts(
      addresses,
      48,
    );
    expect(sizes).toEqual([10, 10, 5]);
    expect(accounts).toHaveLength(25);
  });

  it('reads programs and their ProgramData in two batched calls', async () => {
    const methods: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { method: string; params: [string[]] };
      methods.push(body.method);
      const [addresses] = body.params;
      if (addresses[0] === '4Ec7ZxZS6Sbdg5UGSLHbAnM7GQHp2eFd4KYWRexAipQT') {
        return rpcResponse({
          value: [
            {
              owner: LOADER_UPGRADEABLE,
              executable: false,
              data: ['AwAAADqZFhsAAAAAAbEe+teWj6Z0MSjxc2hlsqQaHI6/h5QpWLZN6DqDii95', 'base64'],
            },
          ],
        });
      }
      return rpcResponse({
        value: [
          {
            owner: LOADER_UPGRADEABLE,
            executable: true,
            data: ['AgAAADAPUGBbvrcwh4nmwPvj5KNgIENvbqDK2oAmDbRv9mCE', 'base64'],
          },
          null,
        ],
      });
    }) as typeof fetch;
    const facts = await readPrograms(new SolanaRpc('https://rpc.example.test', { retries: 0 }), [
      'Prog1111111111111111111111111111111111111111',
      'Gone1111111111111111111111111111111111111111',
    ]);
    expect(methods).toEqual(['getMultipleAccounts', 'getMultipleAccounts']);
    expect(facts.get('Prog1111111111111111111111111111111111111111')).toEqual({
      owner: LOADER_UPGRADEABLE,
      loader: 'upgradeable',
      programDataAddress: '4Ec7ZxZS6Sbdg5UGSLHbAnM7GQHp2eFd4KYWRexAipQT',
      upgradeAuthority: 'CvQZZ23qYDWF2RUpxYJ8y9K4skmuvYEEjH7fK58jtipQ',
      lastDeploySlot: 454465850,
    });
    expect(facts.get('Gone1111111111111111111111111111111111111111')).toBeNull();
  });
});
