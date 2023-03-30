import { BigNumber, ContractTransaction } from 'ethers'
import { encodePath } from './path'
import { ethers } from 'hardhat'
import {
	NULL_ADDRESS,
	FeeAmount
} from "./constants"

const DEADLINE = "0x835f19fb"

export interface MintParams {
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

export interface IncreaseParams {
	tokenId: number
	amount0Desired: BigNumber
	amount1Desired: BigNumber
	amount0Min: BigNumber
	amount1Min: BigNumber
	deadline: number
}

export interface CollectParams {
  tokenId: number
  amount0Max: BigNumber
  amount1Max: BigNumber
}

export interface DecreaseParams {
  tokenId: number
  liquidity: number
  amount0Min: BigNumber
  amount1Min: BigNumber
  deadline: number
}

export function mintParams(
	token0: string,
	token1: string,
	fee: number,
	tickLower: number,
	tickUpper: number,
	amount0Desired: BigNumber,
	amount1Desired: BigNumber,
	amount0Min: BigNumber,
	amount1Min: BigNumber
): MintParams {
	const params: MintParams = {
		token0: token0,
		token1: token1,
		fee: fee,
		tickLower: tickLower,
		tickUpper: tickUpper,
		amount0Desired: amount0Desired,
		amount1Desired: amount1Desired,
		amount0Min: amount0Min,
		amount1Min: amount1Min,
		deadline: DEADLINE
	}
	return params
}

export function increaseParams(
	tokenId: number,
	amount0Desired: BigNumber,
	amount1Desired: BigNumber,
	amount0Min: BigNumber,
	amount1Min: BigNumber
): IncreaseParams {
	const params: IncreaseParams = {
		tokenId: tokenId,
		amount0Desired: amount0Desired,
		amount1Desired: amount1Desired,
		amount0Min: amount0Min,
		amount1Min: amount1Min,
		deadline: DEADLINE
	}
	return params
}

export function collectParams(
	tokenId: number,
	amount0Max: BigNumber,
	amount1Max: BigNumber
): CollectParams {
	const params: CollectParams = {
		tokenId: tokenId,
		amount0Max: amount0Max,
		amount1Max: amount1Max
	}
	return params
}

export function decreaseParams(
	tokenId: number,
	liquidity: number,
	amount0Min: BigNumber,
	amount1Min: BigNumber
): DecreaseParams {
	const params: DecreaseParams = {
		tokenId: tokenId,
		liquidity: liquidity,
		amount0Min: amount0Min,
		amount1Min: amount1Min,
		deadline: DEADLINE
	}
	return params
}