import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat"

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());
  const XXXTokenAddress = '0xf4D222c2137c8B07085145bc3113149Cd889a71D';

  const XXXStaking2 = await ethers.getContractFactory("XXXStaking2");
  const staking2 = await XXXStaking2.deploy(XXXTokenAddress, XXXTokenAddress);
  await staking2.deployed();
  console.log("XXXStaking2 address : ", staking2.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});