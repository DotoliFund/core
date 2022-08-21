import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat"
require('dotenv').config()

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  //const XXXTokenAddress = process.env.TOKEN_ADDRESS;
  //const TimeLockAddress = process.env.TIMELOCK_ADDRESS;
  const XXXTokenAddress = '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f';
  const TimeLockAddress = '0x6c406e2328117BD8ca63F83EAeD7696801f87472';

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