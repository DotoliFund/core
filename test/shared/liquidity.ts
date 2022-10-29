import { BigNumber, ContractTransaction } from 'ethers'
import { XXXFund2 } from '../../typechain-types/contracts/XXXFund2'
import { encodePath } from './path'
import { ethers } from 'hardhat'
import {
	NULL_ADDRESS,
	FeeAmount
} from "./constants"

export interface MintPositionParams {
  investor: string
  token0: string
  token1: string
  fee: number
  tickLower: number
  tickUpper: number
  amount0Desired: BigNumber
  amount1Desired: BigNumber
  amount0Min: BigNumber
  amount1Min: BigNumber
  deadline: number
}

export interface IncreaseLiquidityParams {
  investor: string
  tokenId: number
  amount0Desired: BigNumber
  amount1Desired: BigNumber
  amount0Min: BigNumber
  amount1Min: BigNumber
  deadline: number
}

export interface CollectFeeParams {
  investor: string
  tokenId: number
  amount0Max: BigNumber
  amount1Max: BigNumber
}

export interface DecreaseLiquidityParams {
  investor: string
  tokenId: number
  liquidity: number
  amount0Min: BigNumber
  amount1Min: BigNumber
  deadline: number
}

export function mintPositionParams(
	investor: string,
  token0: string,
  token1: string,
  fee: number,
  tickLower: number,
  tickUpper: number,
  amount0Desired: BigNumber,
  amount1Desired: BigNumber,
  amount0Min: BigNumber,
  amount1Min: BigNumber
): MintPositionParams[] {
	const params: MintPositionParams[] = [
		{
		  investor: investor,
		  token0: tokenIn,
		  token1: string,
		  fee: number,
		  tickLower: tickLower,
		  tickUpper: tickUpper,
		  amount0Desired: amount0Desired,
		  amount1Desired: amount1Desired,
		  amount0Min: amount0Min,
		  amount1Min: amount1Min,
		  deadline: 1234567
		}
	]
	return params
}

export function increaseLiquidityParams(
  investor: string,
  tokenId: number,
  amount0Desired: BigNumber,
  amount1Desired: BigNumber,
  amount0Min: BigNumber,
  amount1Min: BigNumber
): IncreaseLiquidityParams[] {
	const params: IncreaseLiquidityParams[] = [
		{
		  investor: investor,
		  tokenId: tokenId,
		  amount0Desired: amount0Desired,
		  amount1Desired: amount1Desired,
		  amount0Min: amount0Min,
		  amount1Min: amount1Min,
		  deadline: 1234567
		}
	]
	return params
}

export function collectFeeParams(
  investor: string,
  tokenId: number,
  amount0Max: BigNumber,
  amount1Max: BigNumber
): CollectFeeParams[] {
	const params: CollectFeeParams[] = [
		{
		  investor: investor,
		  tokenId: tokenId,
		  amount0Max: amount0Max,
		  amount1Max: amount1Max
		}
	]
	return params
}

export function decreaseLiquidityParams(
  investor: string,
  tokenId: number,
  liquidity: number,
  amount0Min: BigNumber,
  amount1Min: BigNumber
): DecreaseLiquidityParams[] {
	const params: DecreaseLiquidityParams[] = [
		{
		  investor: investor,
		  tokenId: tokenId,
		  liquidity: liquidity,
		  amount0Min: amount0Min,
		  amount1Min: amount1Min,
		  deadline: 1234567
		}
	]
	return params
}