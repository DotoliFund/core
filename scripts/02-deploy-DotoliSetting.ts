import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [account] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", account.address);
  console.log("Account balance:", (await account.getBalance()).toString());

  //mainnet
  const DOTOLI = '0xFd78b26D1E5fcAC01ba43479a44afB69a8073716';
  const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  // //goerli
  // const DOTOLI = '0x3CE9C63607A24785b83b3d6B3245846d402fB49b'
  // const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
  
  const DotoliSetting = await ethers.getContractFactory("DotoliSetting");
  const Setting = await DotoliSetting.deploy(DOTOLI, WETH9);
  await Setting.deployed();
  console.log("Setting address : ", Setting.address);
  console.log("Account balance:", (await account.getBalance()).toString());

  const settingContract = await ethers.getContractAt("DotoliSetting", Setting.address)
  const TimeLockAddress = '0xf1B610176319992a4F89D078A6674A076BceaBc8';
  const transferTx = await settingContract.setOwner(TimeLockAddress)
  await transferTx.wait(1)
  console.log("Account balance:", (await account.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});