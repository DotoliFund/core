import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from "hardhat";

const deployFactoryAndFund: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const XXXFactory = await ethers.getContractFactory("XXXFactory");
  const Factory = await XXXFactory.deploy();
  await Factory.deployed();
  console.log("Factory address : ", Factory.address);

  const XXXFund = await ethers.getContractFactory("XXXFund");
  const Fund = await XXXFund.deploy();
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);

  const factoryContract = await ethers.getContractAt("XXXFactory", Factory.address)
  const timeLockAddress = ''
  const transferTx = await factoryContract.setOwner(timeLockAddress)
  await transferTx.wait(1)
}

export default deployFactoryAndFund;