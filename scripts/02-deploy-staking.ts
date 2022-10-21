import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat"

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const XXXTokenAddress = '0xDf26E13ebF6BD0648BF348006B5F54C062C56633';

  const XXXStaking = await ethers.getContractFactory("XXXStaking");
  const staking = await XXXStaking.deploy(XXXTokenAddress, XXXTokenAddress);
  await staking.deployed();
  console.log("XXXStaking address : ", staking.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});