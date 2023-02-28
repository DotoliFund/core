import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  // //mainnet
  // const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  //goerli
  const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'

  const DotoliSetting = '0x2154E8B9fA4b6b9913eF5C8eEF34616A4D54d3b6'
  const DotoliInfo= '0x2a0aEfAFbc005bb64Bf4f9Ffae0B9D976C3D057A'

  const DotoliFund = await ethers.getContractFactory("DotoliFund");
  const Fund = await DotoliFund.deploy(
    WETH9,
    DotoliSetting,
    DotoliInfo
  );
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});