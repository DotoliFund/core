import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const uniswapV3Factory = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
  const nonfungiblePositionManager = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'

  const UniswapV3Oracle = await ethers.getContractFactory("UniswapV3Oracle");
  const oracle = await UniswapV3Oracle.deploy(
    uniswapV3Factory,
    nonfungiblePositionManager
  );
  await oracle.deployed();
  console.log("UniswapV3Oracle address : ", oracle.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});