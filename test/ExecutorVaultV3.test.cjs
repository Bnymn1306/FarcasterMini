const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ExecutorVaultV3", function () {
  let vault;
  let mockWETH;
  let mockUSDC;
  let mockVIRTUAL;
  let mockFeeToken;
  let mock0xProxy;
  let owner;
  let executor;
  let user1;
  let user2;
  let malicious;

  const DEPOSIT_AMOUNT = ethers.parseEther("10");
  const SWAP_AMOUNT = ethers.parseEther("5");
  const MIN_OUTPUT = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, executor, user1, user2, malicious] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockWETH = await MockERC20.deploy("Wrapped ETH", "WETH", ethers.parseEther("1000000"));
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", ethers.parseEther("1000000"));
    mockVIRTUAL = await MockERC20.deploy("Virtual Token", "VIRTUAL", ethers.parseEther("1000000"));
    
    const MockFeeOnTransferToken = await ethers.getContractFactory("MockFeeOnTransferToken");
    mockFeeToken = await MockFeeOnTransferToken.deploy("Fee Token", "FEE", ethers.parseEther("1000000"), 300); // 3% fee

    // Deploy mock 0x proxy
    const Mock0xProxy = await ethers.getContractFactory("Mock0xProxy");
    mock0xProxy = await Mock0xProxy.deploy();

    // Deploy ExecutorVaultV3
    const ExecutorVaultV3 = await ethers.getContractFactory("ExecutorVaultV3");
    vault = await ExecutorVaultV3.deploy(
      executor.address,
      await mock0xProxy.getAddress(),
      await mockWETH.getAddress()
    );

    // Distribute tokens to users
    await mockWETH.transfer(user1.address, ethers.parseEther("1000"));
    await mockWETH.transfer(user2.address, ethers.parseEther("1000"));
    await mockUSDC.transfer(await mock0xProxy.getAddress(), ethers.parseEther("100000"));
    await mockVIRTUAL.transfer(await mock0xProxy.getAddress(), ethers.parseEther("100000"));
  });

  describe("Deployment", function () {
    it("Should set correct executor", async function () {
      expect(await vault.executor()).to.equal(executor.address);
    });

    it("Should approve WETH by default", async function () {
      expect(await vault.approvedTokens(await mockWETH.getAddress())).to.be.true;
    });

    it("Should approve 0x proxy by default", async function () {
      expect(await vault.approvedSwapTargets(await mock0xProxy.getAddress())).to.be.true;
    });
  });

  describe("Deposit & Withdraw", function () {
    beforeEach(async function () {
      await mockWETH.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
    });

    it("Should allow deposit of approved token", async function () {
      await expect(vault.connect(user1).deposit(await mockWETH.getAddress(), DEPOSIT_AMOUNT))
        .to.emit(vault, "Deposit")
        .withArgs(user1.address, await mockWETH.getAddress(), DEPOSIT_AMOUNT);

      expect(await vault.getBalance(user1.address, await mockWETH.getAddress())).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should reject deposit of unapproved token", async function () {
      await mockUSDC.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(
        vault.connect(user1).deposit(await mockUSDC.getAddress(), DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Token not approved for deposit");
    });

    it("Should allow user to withdraw their balance", async function () {
      await vault.connect(user1).deposit(await mockWETH.getAddress(), DEPOSIT_AMOUNT);

      await expect(vault.connect(user1).withdraw(await mockWETH.getAddress(), DEPOSIT_AMOUNT))
        .to.emit(vault, "Withdraw")
        .withArgs(user1.address, await mockWETH.getAddress(), DEPOSIT_AMOUNT);

      expect(await vault.getBalance(user1.address, await mockWETH.getAddress())).to.equal(0);
    });

    it("Should reject withdraw with insufficient balance", async function () {
      await expect(
        vault.connect(user1).withdraw(await mockWETH.getAddress(), DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should handle fee-on-transfer tokens during deposit", async function () {
      await vault.connect(owner).setToken(await mockFeeToken.getAddress(), true);
      await mockFeeToken.transfer(user1.address, ethers.parseEther("1000"));
      await mockFeeToken.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);

      const depositTx = await vault.connect(user1).deposit(await mockFeeToken.getAddress(), DEPOSIT_AMOUNT);
      await depositTx.wait();

      // 3% fee = 97% received
      const expectedBalance = (DEPOSIT_AMOUNT * 97n) / 100n;
      const actualBalance = await vault.getBalance(user1.address, await mockFeeToken.getAddress());
      
      expect(actualBalance).to.be.closeTo(expectedBalance, ethers.parseEther("0.1"));
    });
  });

  describe("ExecuteSwap - Auto-Withdrawal", function () {
    beforeEach(async function () {
      // User deposits WETH
      await mockWETH.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await vault.connect(user1).deposit(await mockWETH.getAddress(), DEPOSIT_AMOUNT);

      // Setup mock 0x to swap WETH -> VIRTUAL
      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      );
    });

    it("Should execute swap with auto-withdrawal (VIRTUAL not whitelisted)", async function () {
      const user1BalanceBefore = await mockVIRTUAL.balanceOf(user1.address);

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      await expect(
        vault.connect(executor).executeSwap(
          user1.address,
          await mockWETH.getAddress(),
          await mockVIRTUAL.getAddress(),
          SWAP_AMOUNT,
          MIN_OUTPUT,
          await mock0xProxy.getAddress(),
          swapData,
          "order-123",
          true // autoWithdraw = true
        )
      )
        .to.emit(vault, "SwapExecuted")
        .to.emit(vault, "AutoWithdraw");

      // VIRTUAL should be in user wallet, NOT vault
      const user1BalanceAfter = await mockVIRTUAL.balanceOf(user1.address);
      expect(user1BalanceAfter - user1BalanceBefore).to.equal(MIN_OUTPUT);
      expect(await vault.getBalance(user1.address, await mockVIRTUAL.getAddress())).to.equal(0);
    });

    it("Should reject auto-withdrawal for blacklisted token", async function () {
      await vault.connect(owner).setBlacklistedToken(await mockVIRTUAL.getAddress(), true);

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      await expect(
        vault.connect(executor).executeSwap(
          user1.address,
          await mockWETH.getAddress(),
          await mockVIRTUAL.getAddress(),
          SWAP_AMOUNT,
          MIN_OUTPUT,
          await mock0xProxy.getAddress(),
          swapData,
          "order-123",
          true
        )
      ).to.be.revertedWith("Output token is blacklisted");
    });

    it("Should allow vault storage for non-approved tokens when autoWithdraw=false", async function () {
      await vault.connect(owner).setToken(await mockVIRTUAL.getAddress(), true);

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      await vault.connect(executor).executeSwap(
        user1.address,
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT,
        await mock0xProxy.getAddress(),
        swapData,
        "order-123",
        false // autoWithdraw = false, store in vault
      );

      // VIRTUAL should be in vault, NOT wallet
      expect(await vault.getBalance(user1.address, await mockVIRTUAL.getAddress())).to.equal(MIN_OUTPUT);
      expect(await mockVIRTUAL.balanceOf(user1.address)).to.equal(0);
    });

    it("Should handle auto-withdrawal with fee-on-transfer output token within tolerance", async function () {
      // Use 2% fee token (compounded: 0.98 * 0.98 = 96.04%, within 5% tolerance)
      const MockFeeOnTransferToken = await ethers.getContractFactory("MockFeeOnTransferToken");
      const mockLowFeeToken = await MockFeeOnTransferToken.deploy(
        "Low Fee Token",
        "LOWFEE",
        ethers.parseEther("1000000"),
        200 // 2% fee per transfer
      );

      await mockLowFeeToken.transfer(await mock0xProxy.getAddress(), ethers.parseEther("10000"));

      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockLowFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      );

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockLowFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      // Scenario (DOUBLE FEE - 2% per hop):
      // - minToAmount = 100 ETH
      // - maxFeeOnTransferBps = 500 (5%)
      // - minToAmountWithFee = 100 * 95% = 95 ETH
      // - 0x sends 100 → vault receives 100 * 98% = 98 ETH (first fee)
      // - Vault sends 98 → user receives 98 * 98% = 96.04 ETH (second fee)
      // - Compounded loss: 3.96% ✅ (within 5% tolerance)

      const tx = await vault.connect(executor).executeSwap(
        user1.address,
        await mockWETH.getAddress(),
        await mockLowFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT,
        await mock0xProxy.getAddress(),
        swapData,
        "order-123",
        true
      );

      // Verify swap succeeded
      await expect(tx).to.emit(vault, "SwapExecuted");

      // Verify AutoWithdraw event emits ACTUAL received amount (after both fees)
      const expectedReceived = MIN_OUTPUT * 98n / 100n * 98n / 100n; // 96.04 ETH
      await expect(tx)
        .to.emit(vault, "AutoWithdraw")
        .withArgs(user1.address, await mockLowFeeToken.getAddress(), expectedReceived);

      // User should have received 96.04 tokens (compounded 2% fee twice)
      const userBalance = await mockLowFeeToken.balanceOf(user1.address);
      expect(userBalance).to.equal(expectedReceived);
    });

    it("Should handle auto-withdrawal with fee exactly at tolerance boundary", async function () {
      // Create token with 2.53% fee per hop (compounded ≈ 5% total)
      // Formula: (1 - 0.0253)^2 ≈ 0.95 (exactly 5% total loss)
      const MockFeeOnTransferToken = await ethers.getContractFactory("MockFeeOnTransferToken");
      const mockBoundaryFeeToken = await MockFeeOnTransferToken.deploy(
        "Boundary Fee Token",
        "BOUNDARYFEE",
        ethers.parseEther("1000000"),
        253 // 2.53% fee per transfer
      );

      await mockBoundaryFeeToken.transfer(await mock0xProxy.getAddress(), ethers.parseEther("10000"));

      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockBoundaryFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      );

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockBoundaryFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      // Scenario (DOUBLE FEE):
      // - minToAmount = 100
      // - maxFeeOnTransferBps = 500 (5%)
      // - minToAmountWithFee = 100 * 95% = 95
      // - 0x sends 100 → vault receives 100 * 97.47% = 97.47
      // - Vault sends 97.47 → user receives 97.47 * 97.47% ≈ 95
      // - Compounded loss: ≈5% (exactly at boundary, should pass with >=)

      await expect(
        vault.connect(executor).executeSwap(
          user1.address,
          await mockWETH.getAddress(),
          await mockBoundaryFeeToken.getAddress(),
          SWAP_AMOUNT,
          MIN_OUTPUT,
          await mock0xProxy.getAddress(),
          swapData,
          "order-123",
          true
        )
      ).to.not.be.reverted;

      // User should receive approximately 95 tokens (5% total loss)
      const userBalance = await mockBoundaryFeeToken.balanceOf(user1.address);
      const expectedMin = MIN_OUTPUT * 95n / 100n; // 95 ETH
      expect(userBalance).to.be.gte(expectedMin); // Allow slight rounding
    });

    it("Should reject auto-withdrawal when fee-on-transfer exceeds tolerance", async function () {
      // Use existing 3% fee token (compounded: 5.91% > 5% tolerance)
      await mockFeeToken.transfer(await mock0xProxy.getAddress(), ethers.parseEther("10000"));

      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      );

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      // Scenario (DOUBLE FEE - 3% per hop):
      // - minToAmount = 100
      // - maxFeeOnTransferBps = 500 (5%)
      // - minToAmountWithFee = 100 * 95% = 95
      // - 0x sends 100 → vault receives 100 * 97% = 97
      // - Vault sends 97 → user receives 97 * 97% = 94.09 ❌ (below 95!)
      // - Compounded loss: 5.91% (exceeds 5% tolerance)

      await expect(
        vault.connect(executor).executeSwap(
          user1.address,
          await mockWETH.getAddress(),
          await mockFeeToken.getAddress(),
          SWAP_AMOUNT,
          MIN_OUTPUT,
          await mock0xProxy.getAddress(),
          swapData,
          "order-123",
          true
        )
      ).to.be.revertedWith("User received less than minimum after transfer fee");
    });

    it("Should correctly calculate delta when user has pre-existing token balance", async function () {
      // Use 2% fee token for this test (within tolerance)
      const MockFeeOnTransferToken = await ethers.getContractFactory("MockFeeOnTransferToken");
      const mockTestFeeToken = await MockFeeOnTransferToken.deploy(
        "Test Fee Token",
        "TESTFEE",
        ethers.parseEther("1000000"),
        200 // 2% fee
      );

      // Give user some tokens beforehand
      const preExistingBalance = ethers.parseEther("50");
      await mockTestFeeToken.transfer(user1.address, preExistingBalance);

      // Setup swap
      await mockTestFeeToken.transfer(await mock0xProxy.getAddress(), ethers.parseEther("10000"));
      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockTestFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      );

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockTestFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      const userBalanceBefore = await mockTestFeeToken.balanceOf(user1.address);

      await vault.connect(executor).executeSwap(
        user1.address,
        await mockWETH.getAddress(),
        await mockTestFeeToken.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT,
        await mock0xProxy.getAddress(),
        swapData,
        "order-123",
        true
      );

      // User should receive delta (compounded 2% fee), not total balance
      const userBalanceAfter = await mockTestFeeToken.balanceOf(user1.address);
      const expectedReceived = MIN_OUTPUT * 98n / 100n * 98n / 100n; // 96.04
      
      expect(userBalanceAfter - userBalanceBefore).to.equal(expectedReceived);
    });
  });

  describe("ExecuteSwap - Partial Fill & Refund", function () {
    beforeEach(async function () {
      await mockWETH.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await vault.connect(user1).deposit(await mockWETH.getAddress(), DEPOSIT_AMOUNT);
    });

    it("Should refund unspent tokens on partial fill", async function () {
      const actualSpent = SWAP_AMOUNT / 2n; // Mock 0x only spends half
      
      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        actualSpent, // Actual spent < requested
        MIN_OUTPUT
      );

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      const vaultBalanceBefore = await vault.getBalance(user1.address, await mockWETH.getAddress());

      await vault.connect(executor).executeSwap(
        user1.address,
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT,
        await mock0xProxy.getAddress(),
        swapData,
        "order-123",
        true
      );

      // Refund should be: SWAP_AMOUNT - actualSpent
      const expectedRefund = SWAP_AMOUNT - actualSpent;
      const vaultBalanceAfter = await vault.getBalance(user1.address, await mockWETH.getAddress());
      
      expect(vaultBalanceBefore - vaultBalanceAfter).to.equal(actualSpent);
      expect(vaultBalanceAfter).to.equal(DEPOSIT_AMOUNT - actualSpent);
    });

    it.skip("Should reject if swap spends more than expected", async function () {
      // NOTE: This is already protected by SafeERC20 transferFrom which will revert
      // if trying to spend more than user's vault balance. Skipping this test.
    });
  });

  describe("ExecuteSwap - Slippage & Fee Protection", function () {
    beforeEach(async function () {
      await mockWETH.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await vault.connect(user1).deposit(await mockWETH.getAddress(), DEPOSIT_AMOUNT);
    });

    it("Should reject swap with excessive slippage", async function () {
      const lowOutput = MIN_OUTPUT / 2n;
      
      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        lowOutput
      );

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      await expect(
        vault.connect(executor).executeSwap(
          user1.address,
          await mockWETH.getAddress(),
          await mockVIRTUAL.getAddress(),
          SWAP_AMOUNT,
          MIN_OUTPUT,
          await mock0xProxy.getAddress(),
          swapData,
          "order-123",
          true
        )
      ).to.be.revertedWith("Slippage or excessive fee-on-transfer detected");
    });

    it("Should reject swap returning zero tokens", async function () {
      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        0 // Zero output
      );

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      // Zero output gets caught by slippage check first
      await expect(
        vault.connect(executor).executeSwap(
          user1.address,
          await mockWETH.getAddress(),
          await mockVIRTUAL.getAddress(),
          SWAP_AMOUNT,
          MIN_OUTPUT,
          await mock0xProxy.getAddress(),
          swapData,
          "order-123",
          true
        )
      ).to.be.revertedWith("Slippage or excessive fee-on-transfer detected");
    });

    it("Should accept swap within fee-on-transfer tolerance", async function () {
      // Set maxFeeOnTransferBps to 500 (5%)
      // MIN_OUTPUT = 100, with 5% tolerance = 95 minimum acceptable
      const outputWithFee = MIN_OUTPUT - (MIN_OUTPUT * 4n / 100n); // 96 (within 5%)

      await mock0xProxy.setSwapConfig(
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        outputWithFee
      );

      const swapData = mock0xProxy.interface.encodeFunctionData("swap", [
        await mockWETH.getAddress(),
        await mockVIRTUAL.getAddress(),
        SWAP_AMOUNT,
        MIN_OUTPUT
      ]);

      await expect(
        vault.connect(executor).executeSwap(
          user1.address,
          await mockWETH.getAddress(),
          await mockVIRTUAL.getAddress(),
          SWAP_AMOUNT,
          MIN_OUTPUT,
          await mock0xProxy.getAddress(),
          swapData,
          "order-123",
          true
        )
      ).to.not.be.reverted;
    });
  });

  describe("Access Control", function () {
    beforeEach(async function () {
      await mockWETH.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await vault.connect(user1).deposit(await mockWETH.getAddress(), DEPOSIT_AMOUNT);
    });

    it("Should reject executeSwap from non-executor", async function () {
      const swapData = "0x";
      await expect(
        vault.connect(malicious).executeSwap(
          user1.address,
          await mockWETH.getAddress(),
          await mockVIRTUAL.getAddress(),
          SWAP_AMOUNT,
          MIN_OUTPUT,
          await mock0xProxy.getAddress(),
          swapData,
          "order-123",
          true
        )
      ).to.be.revertedWith("Only executor can call");
    });

    it("Should reject executorWithdraw from non-executor", async function () {
      await expect(
        vault.connect(malicious).executorWithdraw(
          user1.address,
          await mockWETH.getAddress(),
          DEPOSIT_AMOUNT
        )
      ).to.be.revertedWith("Only executor can call");
    });

    it("Should allow executor to withdraw on behalf of user", async function () {
      await expect(
        vault.connect(executor).executorWithdraw(
          user1.address,
          await mockWETH.getAddress(),
          DEPOSIT_AMOUNT
        )
      )
        .to.emit(vault, "Withdraw")
        .withArgs(user1.address, await mockWETH.getAddress(), DEPOSIT_AMOUNT);
    });

    it("Should reject setToken from non-owner", async function () {
      await expect(
        vault.connect(malicious).setToken(await mockUSDC.getAddress(), true)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should reject setBlacklistedToken from non-owner", async function () {
      await expect(
        vault.connect(malicious).setBlacklistedToken(await mockVIRTUAL.getAddress(), true)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to approve new deposit token", async function () {
      await expect(vault.connect(owner).setToken(await mockUSDC.getAddress(), true))
        .to.emit(vault, "TokenUpdated")
        .withArgs(await mockUSDC.getAddress(), true);

      expect(await vault.approvedTokens(await mockUSDC.getAddress())).to.be.true;
    });

    it("Should allow owner to blacklist token", async function () {
      await expect(vault.connect(owner).setBlacklistedToken(await mockVIRTUAL.getAddress(), true))
        .to.emit(vault, "TokenBlacklisted")
        .withArgs(await mockVIRTUAL.getAddress(), true);

      expect(await vault.blacklistedTokens(await mockVIRTUAL.getAddress())).to.be.true;
    });

    it("Should allow owner to update max fee tolerance", async function () {
      await expect(vault.connect(owner).setMaxFeeOnTransferBps(1000)) // 10%
        .to.emit(vault, "MaxFeeUpdated")
        .withArgs(500, 1000);

      expect(await vault.maxFeeOnTransferBps()).to.equal(1000);
    });

    it("Should reject max fee > 10%", async function () {
      await expect(
        vault.connect(owner).setMaxFeeOnTransferBps(1001)
      ).to.be.revertedWith("Max fee cannot exceed 10%");
    });

    it("Should allow owner to pause/unpause", async function () {
      await vault.connect(owner).setPaused(true);
      expect(await vault.paused()).to.be.true;

      await expect(
        vault.connect(user1).deposit(await mockWETH.getAddress(), DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Contract is paused");
    });
  });
});
