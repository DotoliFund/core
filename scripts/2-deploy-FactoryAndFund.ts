import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const PriceOracleAddress = '0x2E69559784b482d0EB90c5C968869c489233A459';

  const XXXFactory = await ethers.getContractFactory("XXXFactory");
  const Factory = await XXXFactory.deploy(PriceOracleAddress);
  await Factory.deployed();
  console.log("Factory address : ", Factory.address);

  const XXXFund = await ethers.getContractFactory("XXXFund2");
  const Fund = await XXXFund.deploy();
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);

  const factoryContract = await ethers.getContractAt("XXXFactory", Factory.address)
  const TimeLockAddress = '0x70002f8006D3B3EF903C29D29c99B8d3B8964A99';
  const transferTx = await factoryContract.setOwner(TimeLockAddress)
  await transferTx.wait(1)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});