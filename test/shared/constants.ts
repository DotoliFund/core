import { ethers } from 'hardhat';

export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
export const WETH9_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
//export const WETH9_RINKEBY = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
export const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
export const WETH_CHARGE_AMOUNT = ethers.utils.parseEther("100.0");
export const DEPOSIT_AMOUNT = ethers.utils.parseEther("1.0");
export const WITHDRAW_AMOUNT = ethers.utils.parseEther("0.5");
export const MANAGER_FEE = 1
export const WHITE_LIST_TOKENS = [
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  '0xc778417E063141139Fce010982780140Aa0cD5Ab',
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f'
]

export const EXACT_INPUT_SINGLE_PARAMS = [{
  tradeType: 0,
  swapType: 0,
  investor: ,
  tokenIn: ,
  tokenOut: ,
  recipient: ,
  fee: ,
  amountIn: ,
  amountOut: ,
  amountInMaximum: ,
  amountOutMinimum: ,
  sqrtPriceLimitX96: ,
  path: ,
}]

export const EXACT_INPUT_PARAMS = [{
  tradeType: 0,
  swapType: 1,
  investor: ,
  tokenIn: ,
  tokenOut: ,
  recipient: ,
  fee: ,
  amountIn: ,
  amountOut: ,
  amountInMaximum: ,
  amountOutMinimum: ,
  sqrtPriceLimitX96: ,
  path: ,
}]

export const EXACT_OUTPUT_SINGLE_PARAMS = [{
  tradeType: 1,
  swapType: 0,
  investor: ,
  tokenIn: ,
  tokenOut: ,
  recipient: ,
  fee: ,
  amountIn: ,
  amountOut: ,
  amountInMaximum: ,
  amountOutMinimum: ,
  sqrtPriceLimitX96: ,
  path: ,
}]

export const EXACT_OUTPUT_PARAMS = [{
  tradeType: 1,
  swapType: 1,
  investor: ,
  tokenIn: ,
  tokenOut: ,
  recipient: ,
  fee: ,
  amountIn: ,
  amountOut: ,
  amountInMaximum: ,
  amountOutMinimum: ,
  sqrtPriceLimitX96: ,
  path: ,
}]