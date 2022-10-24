import { ethers } from "hardhat";
import { BigNumber } from 'ethers'
import { NEW_FUND_ADDRESS } from "./constants";

const XXXTokenAddress = '0xf4D222c2137c8B07085145bc3113149Cd889a71D';
const XXXStaking2Address = '0x45fe0820f8680CA5D5AF2849682b454e22C85497';
const sendAmount = BigNumber.from(99999999);

async function main() {

  console.log("\n------------------------------------------------------------------------\n");

  const [test_account_1,test_account_2,test_account_3] = await ethers.getSigners();
  console.log(test_account_1)
  console.log(test_account_2)
  console.log(test_account_3)

  const XXX = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", XXXTokenAddress);
  console.log(await XXX.balanceOf(test_account_3.address))
  console.log(await XXX.balanceOf(XXXStaking2Address))

  console.log(await XXX.connect(test_account_3).approve(XXXStaking2Address, BigNumber.from(10000000000)))
  console.log("\n-----------------1234------------------------------\n");

  console.log(await XXX.connect(test_account_3).transfer(XXXStaking2Address, BigNumber.from(10000000000)))
  console.log("\n-------------------345----------------------------------------\n");

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});