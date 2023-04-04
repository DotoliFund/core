import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [account] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", account.address);
  console.log("Account balance:", (await account.getBalance()).toString());

  const uniswapV3Factory = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
  const nonfungiblePositionManager = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

  const LiquidityOracle = await ethers.getContractFactory("LiquidityOracle");
  const liquidityOracle = await LiquidityOracle.deploy(
    uniswapV3Factory,
    nonfungiblePositionManager
  );
  await liquidityOracle.deployed();
  console.log("LiquidityOracle address : ", liquidityOracle.address);
  console.log("Account balance:", (await account.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});