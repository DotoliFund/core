import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  // //mainnet
  // const DOTOLI = '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f';
  // const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  // const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';

  //goerli
  const DOTOLI = '0x4E318f23D8F6E18aae7F237DDC57C32F3fEe8d8a'
  const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
  //const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
  
  const DotoliSetting = await ethers.getContractFactory("DotoliSetting");
  const Setting = await DotoliSetting.deploy(DOTOLI, WETH9);
  await Setting.deployed();
  console.log("Setting address : ", Setting.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const settingContract = await ethers.getContractAt("DotoliSetting", Setting.address)
  const TimeLockAddress = '0x3F149037A0A40f2EF0F047F5416E16171ccce3AB';
  const transferTx = await settingContract.setOwner(TimeLockAddress)
  await transferTx.wait(1)
  console.log("Account balance:", (await test_account_1.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});