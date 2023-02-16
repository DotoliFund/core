import { BigNumber, ContractTransaction } from 'ethers'
import { encodePath } from './path'
import { ethers } from 'hardhat'
import {
	NULL_ADDRESS,
	FeeAmount
} from "./constants"

const DEADLINE = "0x835f19fb"

export interface MintParams {
	fundId: number
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

export interface IncreaseParams {
	fundId: number
  investor: string
  tokenId: number
  amount0Desired: BigNumber
  amount1Desired: BigNumber
  amount0Min: BigNumber
  amount1Min: BigNumber
  deadline: number
}

export interface CollectParams {
	fundId: number
  investor: string
  tokenId: number
  amount0Max: BigNumber
  amount1Max: BigNumber
}

export interface DecreaseParams {
	fundId: number
  investor: string
  tokenId: number
  liquidity: number
  amount0Min: BigNumber
  amount1Min: BigNumber
  deadline: number
}

export function mintParams(
	fundId: number,
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
): MintParams {
	const params: MintParams = {
		fundId: fundId,
		investor: investor,
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
	fundId: number,
	investor: string,
	tokenId: number,
	amount0Desired: BigNumber,
	amount1Desired: BigNumber,
	amount0Min: BigNumber,
	amount1Min: BigNumber
): IncreaseParams {
	const params: IncreaseParams = {
		fundId: fundId,
		investor: investor,
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
	fundId: number,
	investor: string,
	tokenId: number,
	amount0Max: BigNumber,
	amount1Max: BigNumber
): CollectParams {
	const params: CollectParams = {
		fundId: fundId,
		investor: investor,
		tokenId: tokenId,
		amount0Max: amount0Max,
		amount1Max: amount1Max
	}
	return params
}

export function decreaseParams(
	fundId: number,
	investor: string,
	tokenId: number,
	liquidity: number,
	amount0Min: BigNumber,
	amount1Min: BigNumber
): DecreaseParams {
	const params: DecreaseParams = {
		fundId: fundId,
		investor: investor,
		tokenId: tokenId,
		liquidity: liquidity,
		amount0Min: amount0Min,
		amount1Min: amount1Min,
		deadline: DEADLINE
	}
	return params
}