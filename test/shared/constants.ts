import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'


// //mainnet
// export const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
// export const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
// export const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
// export const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
// export const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
// export const XXX = '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f'

//goerli
export const WETH9 = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
export const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
export const USDC = '0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C'
export const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
export const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
export const XXX = '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f'

export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
export const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'

export const WETH_CHARGE_AMOUNT = ethers.utils.parseEther("100.0")
export const DEPOSIT_AMOUNT = ethers.utils.parseEther("1.0")
export const WITHDRAW_AMOUNT = ethers.utils.parseEther("0.5")

//swap
export const WETH_SWAP_INPUT_AMOUNT = ethers.utils.parseEther("0.3")


export const MANAGER_FEE = 1
export const WHITE_LIST_TOKENS = [
  WETH9,
  WBTC,
  USDC,
  DAI,
  UNI,
  XXX,
]

export enum V3TradeType {
  EXACT_INPUT = 0,
  EXACT_OUTPUT = 1,
}

export enum V3SwapType {
  SINGLE_HOP = 0,
  MULTI_HOP = 1,
}

export enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

export interface V3TradeParams {
  tradeType: number
  swapType: number
  investor: string
  tokenIn: string
  tokenOut: string
  recipient: string
  fee: number
  amountIn: BigNumber
  amountOut: BigNumber
  amountInMaximum: BigNumber
  amountOutMinimum: BigNumber
  sqrtPriceLimitX96: BigNumber
  path: string
}