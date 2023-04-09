import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [account] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", account.address);
  console.log("Account balance:", (await account.getBalance()).toString());

  // //mainnet
  // const DOTOLI = '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f';
  // const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  // const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';

  //goerli
  const DOTOLI = '0x3d50774C395CC57dB82205773feece325f154845'
  const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
  //const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
  
  const DotoliSetting = await ethers.getContractFactory("DotoliSetting");
  const Setting = await DotoliSetting.deploy(DOTOLI, WETH9);
  await Setting.deployed();
  console.log("Setting address : ", Setting.address);
  console.log("Account balance:", (await account.getBalance()).toString());

  const settingContract = await ethers.getContractAt("DotoliSetting", Setting.address)
  const TimeLockAddress = '0x08A7b4E37e4c355eCFFF0748A5fC74DD83Fb5c49';
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