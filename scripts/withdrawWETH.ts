import { ethers } from "hardhat";
require('dotenv').config()
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2';
const WETH9_mainnet = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

async function main() {
  const [test_account_1, test_account_2] = await ethers.getSigners();

  const newFundAddress = '0x42b8b9bc84b831AB03fEeAb66B987B90cF6FfdF3'
  console.log("\n------------------------------------------------------------------------\n");
  // deposit ETH

  console.log("ETH -> WETH : ", ethers.utils.parseEther("0.1"));

  const transactionHash = await test_account_1.sendTransaction({
    to: newFundAddress,
    value: ethers.utils.parseEther("0.1"), // Sends exactly 1.0 ether
  });

  console.log(1)
  const WETH9 = await ethers.getContractAt("IWETH9", '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
  console.log(2)
  console.log("Fund's WETH : ", await WETH9.balanceOf(newFundAddress));

  console.log("\n------------------------------------------------------------------------\n");
  // withdraw ETH

  const fundContract = await ethers.getContractAt("XXXFund2", newFundAddress);
  await fundContract.withdrawWETH(
    test_account_1.address, 
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 
    ethers.utils.parseEther("0.1")
  );
  console.log("WETH -> ETH : ", ethers.utils.parseEther("0.1"));
  console.log("Fund's WETH : ", await WETH9.balanceOf(newFundAddress));

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
