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

  const FactoryAddress = '0x7aFAb5bDE28E2B21576663e25B720c5f58207246'
  const factory = await ethers.getContractAt("XXXFactory", FactoryAddress)

  console.log("\n------------------------------------------------------------------------\n");

  console.log("addInvestorFundList()\n");
  await factory.connect(test_account_1).addInvestorFundList('0x4E000dAf4fC494CADd1b03F55826d67DAdf39F38');
  await factory.connect(test_account_2).addInvestorFundList('0x4E000dAf4fC494CADd1b03F55826d67DAdf39F38');


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});