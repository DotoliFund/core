import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const SwapRouter = await ethers.getContractFactory("SwapRouter");
  const swapRouter = await SwapRouter.deploy();
  await swapRouter.deployed();
  console.log("SwapRouter address : ", swapRouter.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const LiquidityRouter = await ethers.getContractFactory("LiquidityRouter");
  const liquidityRouter = await LiquidityRouter.deploy();
  await liquidityRouter.deployed();
  console.log("LiquidityRouter address : ", liquidityRouter.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});