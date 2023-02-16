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
  const Dotoli = '0xaf75db6618d2955Db5580160958FC667a4a2Aa46'
  
  const ROUTER = '0xaf75db6618d2955Db5580160958FC667a4a2Aa46'

  const DotoliFactory = await ethers.getContractFactory("DotoliFactory");
  const Factory = await DotoliFactory.deploy(WETH9, Dotoli, ROUTER);
  await Factory.deployed();
  console.log("Factory address : ", Factory.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const DotoliFund = await ethers.getContractFactory("DotoliFund");
  const Fund = await DotoliFund.deploy();
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const factoryContract = await ethers.getContractAt("DotoliFactory", Factory.address)
  const TimeLockAddress = '0xCBE1C35272735dEaF720bB6F1687651BD1bbFdF7';
  const transferTx = await factoryContract.setOwner(TimeLockAddress)
  await transferTx.wait(1)
  console.log("Account balance:", (await test_account_1.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});