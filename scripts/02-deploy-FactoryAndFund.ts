import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
require('dotenv').config()

async function main() {
  const [test_account_1] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", test_account_1.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  // //mainnet
  // const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  // const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
  // const DOTOLI = '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f';

  //goerli
  const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
  //const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
  const DOTOLI = '0x7ef721d1B2D9c46A271d6796CdADE5beE2ed6978'
  
  const SWAP_ROUTER = '0x166F02F1a9CDf608359793413B5c607E49F4Af15'
  const LIQUIDITY_ROUTER = '0x2a0aEfAFbc005bb64Bf4f9Ffae0B9D976C3D057A'

  const DotoliFactory = await ethers.getContractFactory("DotoliFactory");
  const Factory = await DotoliFactory.deploy(WETH9, DOTOLI);
  await Factory.deployed();
  console.log("Factory address : ", Factory.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const DotoliFund = await ethers.getContractFactory("DotoliFund");
  const Fund = await DotoliFund.deploy(
    Factory.address,
    WETH9,
    SWAP_ROUTER,
    LIQUIDITY_ROUTER
  );
  await Fund.deployed();
  console.log("Fund address : ", Fund.address);
  console.log("Account balance:", (await test_account_1.getBalance()).toString());

  const factoryContract = await ethers.getContractAt("DotoliFactory", Factory.address)
  const TimeLockAddress = '0x472840433F094a342eC12fA72E4e16488eba62Bb';
  const transferTx = await factoryContract.setOwner(TimeLockAddress)
  await transferTx.wait(1)
  console.log("Account balance:", (await test_account_1.getBalance()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});