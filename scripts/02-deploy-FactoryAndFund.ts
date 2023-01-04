import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const XXXFactory = await ethers.getContractFactory("XXXFactory");
  const Factory = await XXXFactory.deploy();
  await Factory.deployed();
  console.log("Factory address : ", Factory.address);

  const XXXFund = await ethers.getContractFactory("XXXFund2");
  const Fund = await XXXFund.deploy();
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);

  const factoryContract = await ethers.getContractAt("XXXFactory", Factory.address)
  const TimeLockAddress = '0xD3Cad55E70fD46910a8b6Ea4A6F22BB381Ba111a';
  const transferTx = await factoryContract.setOwner(TimeLockAddress)
  await transferTx.wait(1)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});