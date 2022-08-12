import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from "hardhat";

const setupContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"
  const { getNamedAccounts } = hre
  const { deployer } = await getNamedAccounts()

  const timeLockAddress = ''
  const timeLock = await ethers.getContractAt("TimeLock", timeLockAddress)
  const governorContractAddress = ''
  const governor = await ethers.getContractAt("GovernorContract", governorContractAddress)

  // would be great to use multicall here...
  const proposerRole = await timeLock.PROPOSER_ROLE()
  const executorRole = await timeLock.EXECUTOR_ROLE()
  const adminRole = await timeLock.TIMELOCK_ADMIN_ROLE()

  const proposerTx = await timeLock.grantRole(proposerRole, governor.address)
  await proposerTx.wait(1)
  const executorTx = await timeLock.grantRole(executorRole, ADDRESS_ZERO)
  await executorTx.wait(1)
  const revokeTx = await timeLock.revokeRole(adminRole, deployer)
  await revokeTx.wait(1)
  // Now, anything the timelock wants to do has to go through the governance process
};

export default setupContracts;