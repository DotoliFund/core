import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const MIN_DELAY = 3600 // 1 hour - after a vote passes, you have 1 hour before you can enact
  const TimeLock = await ethers.getContractFactory("TimeLock");
  const timeLock = await TimeLock.deploy(MIN_DELAY, [], []);
  await timeLock.deployed();
  console.log("TimeLock address : ", timeLock.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});