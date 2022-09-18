import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

  const TimeLockAddress = '0x6c406e2328117BD8ca63F83EAeD7696801f87472';
  const timeLock = await ethers.getContractAt("TimeLock", TimeLockAddress)
  const XXXGovernorAddress = '0x3cA490bF1cc327dB3eB8B297C43aE3A3922B424d';

  // would be great to use multicall here...
  const proposerRole = await timeLock.PROPOSER_ROLE()
  const executorRole = await timeLock.EXECUTOR_ROLE()
  const adminRole = await timeLock.TIMELOCK_ADMIN_ROLE()

  const proposerTx = await timeLock.grantRole(proposerRole, XXXGovernorAddress)
  await proposerTx.wait(1)
  const executorTx = await timeLock.grantRole(executorRole, ADDRESS_ZERO)
  await executorTx.wait(1)
  const revokeTx = await timeLock.revokeRole(adminRole, deployer.address)
  await revokeTx.wait(1)
  // Now, anything the timelock wants to do has to go through the governance process
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});