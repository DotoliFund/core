import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [account] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", account.address);
  console.log("Account balance:", (await account.getBalance()).toString());

  // //mainnet
  // const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  //goerli
  const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'

  const DotoliSetting = '0x6700CFcC692Ed84eF1d2DB1882461Aee1306C4f2'
  const DotoliInfo= '0x342F633A0F701a5d19b5Bf8eB521eEEa77123611'

  const DotoliFund = await ethers.getContractFactory("DotoliFund");
  const Fund = await DotoliFund.deploy(
    WETH9,
    DotoliSetting,
    DotoliInfo
  );
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);
  console.log("Account balance:", (await account.getBalance()).toString());

  console.log("DotoliInfo setOwner to Fund", (await account.getBalance()).toString());
  const infoContract = await ethers.getContractAt("DotoliInfo", DotoliInfo)
  const transferTx = await infoContract.setOwner(Fund.address)
  await transferTx.wait(1)
  console.log("Account balance:", (await account.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});