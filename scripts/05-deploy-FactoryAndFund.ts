import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const XXXFactory = await ethers.getContractFactory("XXXFactory");
  const Factory = await XXXFactory.deploy();
  await Factory.deployed();
  console.log("Factory address : ", Factory.address);

  const XXXFund = await ethers.getContractFactory("XXXFund");
  const Fund = await XXXFund.deploy();
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);

  const factoryContract = await ethers.getContractAt("XXXFactory", Factory.address)
  const TimeLockAddress = '0x6c406e2328117BD8ca63F83EAeD7696801f87472';
  const transferTx = await factoryContract.setOwner(TimeLockAddress)
  await transferTx.wait(1)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});