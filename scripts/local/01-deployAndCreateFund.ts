import { ethers } from "hardhat";

async function main() {
  // const currentTimestampInSeconds = Math.round(Date.now() / 1000);
  // const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
  // const unlockTime = currentTimestampInSeconds + ONE_YEAR_IN_SECS;

  // const lockedAmount = ethers.utils.parseEther("1");

  // const Lock = await ethers.getContractFactory("Lock");
  // const lock = await Lock.deploy(unlockTime, { value: lockedAmount });

  // await lock.deployed();

  // console.log("Lock with 1 ETH deployed to:", lock.address);

  const [owner, otherAccount] = await ethers.getSigners();

  const XXXFactory = await ethers.getContractFactory("XXXFactory");
  const Factory = await XXXFactory.deploy();
  await Factory.deployed();
  console.log("Factory address : ", Factory.address);

  const XXXFund2 = await ethers.getContractFactory("XXXFund2");
  const Fund = await XXXFund2.deploy();
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);

  console.log("new Fund address : ", await Factory.createFund(owner.address));


  const XXXFactoryContract = await ethers.getContractAt("XXXFactory", Factory.address);

  console.log("\n------------------------------------------------------------------------\n");

  const managerFund = await XXXFactoryContract.getFundByManager(owner.address);

  console.log("getFundByManager()\n");
  console.log("investor : ", owner.address);
  console.log("managerFund : ", managerFund);

  console.log("\n------------------------------------------------------------------------\n");

  const investorFundList = await XXXFactoryContract.getInvestorFundList(owner.address);

  console.log("getInvestorFundList()\n");
  console.log("investor : ", owner.address);
  console.log("investorFundList : ", investorFundList);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
