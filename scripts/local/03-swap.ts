import { ethers } from "hardhat";
import { 
  NEW_FUND_ADDRESS,
  WETH9_MAINNET,
  UNI_ADDRESS,
  DEPOSIT_AMOUNT,
  AmountOutMinimum,
  V3TradeParamsStruct,
  V3_SWAP_ROUTER_ADDRESS,
  ExactInputSingleParams
} from "./constants";
import chai from "chai";
import { solidity } from "ethereum-waffle";

chai.use(solidity);

enum TradeType {
  SINGLE_HOP,
  MULTI_HOP
}

enum SwapType {
  EXACT_INPUT,
  EXACT_OUTPUT
}

async function main() {

  const [owner, otherAccount] = await ethers.getSigners();

  console.log("\n------------------------------------------------------------------------\n");
  // swap WETH -> UNI
  // swap call parameter (array length 1)

  const swapCallParameter : V3TradeParamsStruct = {
    tradeType: TradeType.SINGLE_HOP,
    swapType: SwapType.EXACT_INPUT,
    investor: owner.address,
    tokenIn: WETH9_MAINNET,
    tokenOut: UNI_ADDRESS,
    recipient: NEW_FUND_ADDRESS,
    fee: 500,
    amountIn: ethers.BigNumber.from(DEPOSIT_AMOUNT),
    amountOut: ethers.BigNumber.from(0),
    amountInMaximum: ethers.BigNumber.from(0),
    amountOutMinimum: ethers.BigNumber.from(AmountOutMinimum),
    sqrtPriceLimitX96: ethers.BigNumber.from(0),
    path: "0x1231"
  };

        //     IV3SwapRouter.ExactInputSingleParams({
        //         tokenIn: 0xc778417E063141139Fce010982780140Aa0cD5Ab,
        //         tokenOut: 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984,
        //         fee: 500,
        //         recipient: address(this),
        //         //deadline: _params.deadline,
        //         //amountIn: 0x02c68af0bb140000,  //0.2
        //         amountIn: 0x011c37937e080000,   //0.08
        //         amountOutMinimum: 0x01802d909beab40d,
        //         sqrtPriceLimitX96: 0
        //     });
  const swapCallParameters = [swapCallParameter]
  const newFund = await ethers.getContractAt("XXXFund2", NEW_FUND_ADDRESS);
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

  console.log("<<< Check Data >>>\n")
  console.log("investorTokens : mapping(address => mapping(uint256 => Token))\n");

  const investorTokenCount = await newFund.investorTokenCount(owner.address);
  console.log('investorTokenCount :', investorTokenCount);
  for (let i=0; i<investorTokenCount.toNumber(); i++) {
    const investorToken = await newFund.investorTokens(owner.address, i);
    console.log('investorToken :', investorToken);
  }


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
