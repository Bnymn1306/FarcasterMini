import test from "node:test";
import assert from "node:assert/strict";
import { assertSelectedAccount, selectPersistedProvider, switchAndAssertBase } from "../client/src/lib/walletSecurity";

test("persists the explicitly selected provider when multiple wallets are injected", () => {
  const wallets = [{ uuid: "metamask" }, { uuid: "coinbase" }];
  assert.equal(selectPersistedProvider(wallets, "coinbase"), wallets[1]);
  assert.equal(selectPersistedProvider(wallets), undefined);
  assert.equal(selectPersistedProvider([wallets[0]]), wallets[0]);
});

test("switches a wrong-network wallet to Base before returning", async () => {
  let chainId = "0x1";
  const calls: string[] = [];
  await switchAndAssertBase({ request: async ({ method }) => {
    calls.push(method);
    if (method === "wallet_switchEthereumChain") chainId = "0x2105";
    return method === "eth_chainId" ? chainId : null;
  } });
  assert.deepEqual(calls, ["eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);
});

test("fails when the wallet does not actually switch to Base", async () => {
  const sent: string[] = [];
  await assert.rejects(
    switchAndAssertBase({ request: async ({ method }) => {
      sent.push(method);
      return method === "eth_chainId" ? "0x1" : null;
    } }),
    /Base network is required/,
  );
  assert.equal(sent.includes("eth_sendTransaction"), false);
});

test("account changes invalidate the signing flow", () => {
  assert.doesNotThrow(() => assertSelectedAccount(["0xAbC"], "0xabc"));
  assert.throws(() => assertSelectedAccount(["0xdef"], "0xabc"), /account changed/);
});