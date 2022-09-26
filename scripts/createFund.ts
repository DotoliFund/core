import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
import { XXXFactory } from '../typechain-types/contracts/XXXFactory';
require('dotenv').config()

const WETH9_RINKEBY = '0xc778417E063141139Fce010982780140Aa0cD5Ab'

async function main() {
  const [account1, account2] = await ethers.getSigners();
  console.log("Deploying contracts with the account1:", account1.address);
  console.log("Deploying contracts with the account2:", account2.address);
  console.log("Account1 balance:", (await account1.getBalance()).toString());
  console.log("Account2 balance:", (await account2.getBalance()).toString());

  const FactoryAddress = '0x373b38CD4f8C3bB195fEc2d735Ea9a106bA7012D'
  const factory = await ethers.getContractAt("XXXFactory", FactoryAddress)
  
  const newFundAddress = await factory.connect(account1).createFund(account1.address);
  console.log("new fund address : ", newFundAddress);
  const newFundAddress2 = await factory.connect(account2).createFund(account2.address);
  console.log("new fund address2 : ", newFundAddress2);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});