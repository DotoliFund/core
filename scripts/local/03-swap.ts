import { ethers } from "hardhat";
import { 
  NEW_FUND_ADDRESS,
  WETH9_MAINNET,
  UNI_ADDRESS,
  DEPOSIT_AMOUNT,
  V3TradeParamsStruct,
  V3_SWAP_ROUTER_ADDRESS,
  ExactInputSingleParams
} from "./constants";

async function main() {

  const [owner, otherAccount] = await ethers.getSigners();


  console.log("\n------------------------------------------------------------------------\n");
  // swap WETH -> UNI
  // swap call parameter (array length 1)

  const swapCallParameter : V3TradeParamsStruct = {
    tradeType: 0,
    swapType: 0,
    investor: owner.address,
    tokenIn: WETH9_MAINNET,
    tokenOut: UNI_ADDRESS,
    recipient: owner.address,
    fee: 1000,
    amountIn: DEPOSIT_AMOUNT,
    amountOut: 0,
    amountInMaximum: 0,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
    path: "0x1231"
  };
  const swapCallParameters = [swapCallParameter]
  const newFund = await ethers.getContractAt("XXXFund", NEW_FUND_ADDRESS);
  await newFund.swap(swapCallParameters);

  console.log("swap()\n");
  console.log("Fund address : ", NEW_FUND_ADDRESS);
  console.log("tradeType : ", swapCallParameters[0].tradeType);
  console.log("swapType : ", swapCallParameters[0].swapType);
  console.log("investor : ", swapCallParameters[0].investor);
  console.log("tokenIn : ", swapCallParameters[0].tokenIn);
  console.log("tokenOut : ", swapCallParameters[0].tokenOut);
  console.log("recipient : ", swapCallParameters[0].recipient);
  console.log("fee : ", swapCallParameters[0].fee);
  console.log("amountIn : ", swapCallParameters[0].amountIn);
  console.log("amountOut : ", swapCallParameters[0].amountOut);
  console.log("amountInMaximum : ", swapCallParameters[0].amountInMaximum);
  console.log("amountOutMinimum : ", swapCallParameters[0].amountOutMinimum);
  console.log("sqrtPriceLimitX96 : ", swapCallParameters[0].sqrtPriceLimitX96);
  console.log("path : ", swapCallParameters[0].path);

  const WETH = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH9_MAINNET);
  const UNI = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", UNI_ADDRESS);
  //console.log("New Fund's WETH balance : ", await WETH.balanceOf(NEW_FUND_ADDRESS));
  console.log("New Fund's UNI balance : ", await UNI.balanceOf(NEW_FUND_ADDRESS));



  // swap call parameter (array length >1)

  // swap WETH -> UNI


  console.log("\n------------------------------------------------------------------------\n");




}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
