import { BigNumber, ContractTransaction } from 'ethers'
import { DotoliFund } from '../../typechain-types/contracts/DotoliFund'
import { encodePath } from './path'
import { ethers } from 'hardhat'
import {
	NULL_ADDRESS,
	FeeAmount
} from "./constants"

export enum SwapType {
  EXACT_INPUT_SINGLE_HOP = 0,
  EXACT_INPUT_MULTI_HOP = 1,
  EXACT_OUTPUT_SINGLE_HOP = 2,
  EXACT_OUTPUT_MULTI_HOP = 3
}

export interface SwapParams {
  swapType: number
  tokenIn: string
  tokenOut: string
  fee: number
  amountIn: BigNumber
  amountOut: BigNumber
  amountInMaximum: BigNumber
  amountOutMinimum: BigNumber
  sqrtPriceLimitX96: BigNumber
  path: string
}

export function exactInputSingleParams(
  tokenIn: string,
  tokenOut: string,
  amountIn: BigNumber,
  amountOutMinimum: BigNumber,
  sqrtPriceLimitX96: BigNumber,
): SwapParams[] {
	const params: SwapParams[] = [
		{
      swapType: SwapType.EXACT_INPUT_SINGLE_HOP,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: FeeAmount.MEDIUM,
      amountIn,
      amountOut: BigNumber.from(0),
      amountInMaximum: BigNumber.from(0),
      amountOutMinimum,
      sqrtPriceLimitX96: sqrtPriceLimitX96 ?? BigNumber.from(0),
      path: '0x1234' // path is not used
		}
	]
	return params
}

export function exactOutputSingleParams(
  tokenIn: string,
  tokenOut: string,
  amountOut: BigNumber,
  amountInMaximum: BigNumber,
  sqrtPriceLimitX96: BigNumber,
): SwapParams[] {
	const params: SwapParams[] = [
		{
	    swapType: SwapType.EXACT_OUTPUT_SINGLE_HOP,
	    tokenIn: tokenIn,
	    tokenOut: tokenOut,
	    fee: FeeAmount.MEDIUM,
	    amountIn: BigNumber.from(0),
	    amountOut,
	    amountInMaximum,
	    amountOutMinimum: BigNumber.from(0),
	    sqrtPriceLimitX96: sqrtPriceLimitX96 ?? BigNumber.from(0),
	    path: '0x1234' // path is not used
		}
	]
	return params
}

export function exactInputParams(
	tokens: string[],
  amountIn: BigNumber,
  amountOutMinimum: BigNumber,
): SwapParams[] {
  const path = encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
	const params: SwapParams[] = [
		{
			swapType: SwapType.EXACT_INPUT_MULTI_HOP,
			tokenIn: NULL_ADDRESS,
			tokenOut: NULL_ADDRESS,
			fee: 0,
      amountIn,
      amountOut: BigNumber.from(0),
      amountInMaximum: BigNumber.from(0),
      amountOutMinimum,
			sqrtPriceLimitX96: BigNumber.from(0),
			path: path
		}
	]
	return params
}

export function exactOutputParams(
	tokens: string[],
	amountOut: BigNumber,
	amountInMaximum: BigNumber,
): SwapParams[] {
	const path = encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
	const params: SwapParams[] = [
		{
			swapType: SwapType.EXACT_OUTPUT_MULTI_HOP,
			tokenIn: NULL_ADDRESS,
			tokenOut: NULL_ADDRESS,
			fee: 0,
			amountIn: BigNumber.from(0),
			amountOut,
			amountInMaximum,
			amountOutMinimum: BigNumber.from(0),
			sqrtPriceLimitX96: BigNumber.from(0),
			path: path
		}
	]
	return params
}