import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  // //mainnet
  // const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  // const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
  // const Dotoli = '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f';

  //goerli
  const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
  //const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
  const Dotoli = '0x5D8aa1475Fb7A56229fafcB4e7F2B31264dc0C11'

  const DotoliFactory = await ethers.getContractFactory("DotoliFactory");
  const Factory = await DotoliFactory.deploy(WETH9, Dotoli);
  await Factory.deployed();
  console.log("Factory address : ", Factory.address);

  const DotoliFund = await ethers.getContractFactory("DotoliFund");
  const Fund = await DotoliFund.deploy();
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);

  const factoryContract = await ethers.getContractAt("DotoliFactory", Factory.address)
  const TimeLockAddress = '0x4596A568AE4E6D3121527900901AD700Be7B0188';
  const transferTx = await factoryContract.setOwner(TimeLockAddress)
  await transferTx.wait(1)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});