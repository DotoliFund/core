import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'


//mainnet
export const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
export const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
export const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
export const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
export const XXX = '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f'

export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
export const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
export const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
export const NonfungiblePositionManager = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88' 

export const WETH_CHARGE_AMOUNT = ethers.utils.parseEther("100.0")
export const DEPOSIT_AMOUNT = ethers.utils.parseEther("1.0")
export const WITHDRAW_AMOUNT = ethers.utils.parseEther("0.5")

//swap
export const WETH_SWAP_INPUT_AMOUNT = ethers.utils.parseEther("0.3")


export const MANAGER_FEE = 1
export const WHITE_LIST_TOKENS = [
  WETH9,
  UNI,
  XXX,
]

export const MaxUint128 = BigNumber.from(2).pow(128).sub(1)

export enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
}