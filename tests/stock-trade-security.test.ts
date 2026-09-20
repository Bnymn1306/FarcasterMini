import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  AERODROME_SWAP_ROUTER,
  BASE_USDC,
  B20_ASSETS,
  StockAgentError,
  assertAerodromeQuoteIntent,
  asset,
  evaluatePreflight,
} from "../server/services/stockAgentService";
import { assertFreshQuote, exactApproval } from "../client/src/lib/stockTradeSecurity";

const router = new ethers.Interface([
  "function exactInputSingle((address tokenIn,address tokenOut,int24 tickSpacing,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
const wallet = "0x1111111111111111111111111111111111111111";
const stock = B20_ASSETS[0].address;
const deadline = 2_000_000_000;
const amount = "1000000";
const minimum = 900n;

function calldata(overrides: Record<string, unknown> = {}) {
  return router.encodeFunctionData("exactInputSingle", [{
    tokenIn: BASE_USDC.address,
    tokenOut: stock,
    tickSpacing: 10,
    recipient: wallet,
    deadline,
    amountIn: amount,
    amountOutMinimum: minimum,
    sqrtPriceLimitX96: 0,
    ...overrides,
  }]);
}

test("unsupported assets fail closed", () => {
  assert.throws(
    () => asset("0x2222222222222222222222222222222222222222"),
    (error: StockAgentError) => error.code === "ASSET_NOT_ALLOWLISTED",
  );
});

test("reviewed recipient, amount, and minimum output are enforced", () => {
  assert.doesNotThrow(() => assertAerodromeQuoteIntent(calldata(), wallet, BASE_USDC.address, stock, amount, minimum, deadline));
  for (const changed of [
    { recipient: "0x3333333333333333333333333333333333333333" },
    { amountIn: 999999n },
    { amountOutMinimum: 899n },
    { deadline: deadline + 1 },
  ]) {
    assert.throws(
      () => assertAerodromeQuoteIntent(calldata(changed), wallet, BASE_USDC.address, stock, amount, minimum, deadline),
      (error: StockAgentError) => error.code === "QUOTE_INTENT_MISMATCH",
    );
  }
});

test("reviewed sell direction is enforced", () => {
  const sellData = calldata({ tokenIn: stock, tokenOut: BASE_USDC.address, amountIn: 100_000_000n });
  assert.doesNotThrow(() => assertAerodromeQuoteIntent(sellData, wallet, stock, BASE_USDC.address, "100000000", minimum, deadline));
  assert.throws(
    () => assertAerodromeQuoteIntent(sellData, wallet, BASE_USDC.address, stock, "100000000", minimum, deadline),
    (error: StockAgentError) => error.code === "QUOTE_INTENT_MISMATCH",
  );
});

test("approval uses the exact reviewed spender and amount", () => {
  const approval = exactApproval(AERODROME_SWAP_ROUTER, amount);
  assert.equal(approval.spender, AERODROME_SWAP_ROUTER);
  assert.equal(approval.amount, 1_000_000n);
});

test("expired quotes fail before approval or submission", () => {
  assert.doesNotThrow(() => assertFreshQuote(2_000, 1_999));
  assert.throws(() => assertFreshQuote(2_000, 2_000), /Quote expired/);
  assert.throws(() => assertFreshQuote(undefined, 1_000), /Quote expired/);
});

test("issuer-rejected simulations fail closed", async () => {
  await assert.rejects(
    evaluatePreflight(100n, 100n, 100n, async () => { throw new Error("issuer blocked"); }),
    (error: StockAgentError) => error.status === 451 && error.code === "TRADE_SIMULATION_REJECTED",
  );
  assert.deepEqual(
    await evaluatePreflight(100n, 99n, 100n, async () => { throw new Error("must not run"); }),
    { hasBalance: true, hasAllowance: false, simulated: false },
  );
});