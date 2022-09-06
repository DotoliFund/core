import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
import { XXXFactory } from '../typechain-types/contracts/XXXFactory';
require('dotenv').config()


async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const FactoryAddress = '0x80E5189518a6A8d7C54B326c9c3003d65489c793'
  const factory = await ethers.getContractAt("XXXFactory", FactoryAddress)
  const createdFundAddress = await factory.createFund(deployer.address);
  console.log("new fund address : ", createdFundAddress);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});