import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
import { XXXFactory } from '../typechain-types/contracts/XXXFactory';
require('dotenv').config()


async function main() {
  const [test_account_1, test_account_2] = await ethers.getSigners();
  console.log("Deploying contracts with the account1:", test_account_1.address);
  console.log("Deploying contracts with the account2:", test_account_2.address);
  console.log("Account1 balance:", (await test_account_1.getBalance()).toString());
  console.log("Account2 balance:", (await test_account_2.getBalance()).toString());

  const FactoryAddress = '0x90107713F5bE7304ec2db5B0dB7f4Df98C62e1d4'
  const factory = await ethers.getContractAt("XXXFactory", FactoryAddress)
  
  const newFundAddress = await factory.connect(test_account_1).createFund(test_account_1.address);
  console.log("new fund address : ", newFundAddress);
  const newFundAddress2 = await factory.connect(test_account_2).createFund(test_account_2.address);
  console.log("new fund address2 : ", newFundAddress2);

  console.log("\n------------------------------------------------------------------------\n");

  console.log("addInvestorFundList()\n");
  await factory.connect(test_account_1).addInvestorFundList(newFundAddress);
  await factory.connect(test_account_2).addInvestorFundList(newFundAddress);


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});