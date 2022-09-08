import { ethers } from "hardhat";

const newFundAddress = '';
const WETH9_mainnet = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WETH9_rinkeby = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
const depositAmount = 0.2;

async function main() {

  const [owner, otherAccount] = await ethers.getSigners();

  const newFund = await ethers.getContractAt("XXXFund", newFundAddress);

  await newFund.deposit(owner.address, WETH9_rinkeby, depositAmount);

  console.log("Fund address : ", Fund.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
