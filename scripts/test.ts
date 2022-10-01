import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat";
import { Wallet, constants, BigNumber, ContractTransaction, Contract } from 'ethers'
import { XXXFactory } from '../typechain-types/contracts/XXXFactory';
require('dotenv').config()

const WETH9_RINKEBY = '0xc778417E063141139Fce010982780140Aa0cD5Ab'
const newFundAddress = '0x2657113bCbA69B12F63f130A304ebc49D995DB23'
const newFund2Address = '0x2657113bCbA69B12F63f130A304ebc49D995DB23'

async function main() {
  const [account1, account2] = await ethers.getSigners();
  console.log("Deploying contracts with the account1:", account1.address);
  console.log("Deploying contracts with the account2:", account2.address);
  console.log("Account1 balance:", (await account1.getBalance()).toString());
  console.log("Account2 balance:", (await account2.getBalance()).toString());

  const FactoryAddress = '0x645333C1EB5acE016777efD6f1c3c5a843797876'
  const factory = await ethers.getContractAt("XXXFactory", FactoryAddress)

  const fund1 = await ethers.getContractAt("XXXFund2", newFundAddress)
  const fund2 = await ethers.getContractAt("XXXFund2", newFund2Address)

  const weth9 = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH9_RINKEBY)

  console.log("\n------------------------------------------------------------------------\n");

  console.log("addInvestorFundList()\n");
  await factory.connect(account1).addInvestorFundList(newFundAddress);
  //await factory.connect(account2).addInvestorFundList(newFundAddress);

  console.log("\n------------------------------------------------------------------------\n");
  
  console.log("deposit()\n");
  console.log(await fund1.connect(account1).getInvestorTokenAmount(account1.address, WETH9_RINKEBY))
  await weth9.connect(account1).approve(fund1.address, constants.MaxUint256)
  await fund1.connect(account1).deposit(WETH9_RINKEBY, ethers.utils.parseEther("0.001"));
  console.log(await fund1.connect(account1).getInvestorTokenAmount(account1.address, WETH9_RINKEBY))

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});