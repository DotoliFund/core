import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [account] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", account.address);
  console.log("Account balance:", (await account.getBalance()).toString());

  //mainnet
  const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  // //goerli
  // const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'

  const DotoliSetting = '0x5E1cE0e492f956b4a1A1963E4A465256C060966c'
  const DotoliInfo= '0xD72008394f456362765446aD8638a0B0ee226d70'

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