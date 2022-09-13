import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
import { XXXFactory } from '../typechain-types/contracts/XXXFactory';
require('dotenv').config()


async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const FactoryAddress = '0xdebA34FA75E45a7e8f52ebd5775132ECa170dA6C'
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