import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat"
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  //const XXXTokenAddress = process.env.TOKEN_ADDRESS;
  //const TimeLockAddress = process.env.TIMELOCK_ADDRESS;
  const XXXTokenAddress = '0xf4D222c2137c8B07085145bc3113149Cd889a71D';
  const TimeLockAddress = '0x70002f8006D3B3EF903C29D29c99B8d3B8964A99';

  // Governor Values
  const QUORUM_PERCENTAGE = 4 // Need 4% of voters to pass
  // export const VOTING_PERIOD = 45818 // 1 week - how long the vote lasts. This is pretty long even for local tests
  const VOTING_PERIOD = 5 // blocks
  const VOTING_DELAY = 1 // 1 Block - How many blocks till a proposal vote becomes active

  const XXXGovernor = await ethers.getContractFactory("XXXGovernor");
  const governorContract = await XXXGovernor.deploy(
    XXXTokenAddress,
    TimeLockAddress,
    QUORUM_PERCENTAGE,
    VOTING_PERIOD,
    VOTING_DELAY);
  await governorContract.deployed();
  console.log("XXXGovernor address : ", governorContract.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});