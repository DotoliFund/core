import { BigNumber, ContractTransaction } from 'ethers'
import { XXXFund2 } from '../../typechain-types/contracts/XXXFund2'
import { encodePath } from './path'
import { ethers } from 'hardhat'
import {
	NULL_ADDRESS,
	V3TradeType,
	V3SwapType,
	V3TradeParams,
	FeeAmount
} from "./constants"

export function exactInputSingleParams(
	investor: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: BigNumber,
  amountOutMinimum: BigNumber,
  sqrtPriceLimitX96: BigNumber,
	fundAddress: string
): V3TradeParams[] {
	const params: V3TradeParams[] = [
		{
      tradeType: V3TradeType.EXACT_INPUT,
      swapType: V3SwapType.SINGLE_HOP,
      investor: investor,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      recipient: fundAddress,
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
	investor: string,
  tokenIn: string,
  tokenOut: string,
  amountOut: BigNumber,
  amountInMaximum: BigNumber,
  sqrtPriceLimitX96: BigNumber,
	fundAddress: string
): V3TradeParams[] {
	const params: V3TradeParams[] = [
		{
	    tradeType: V3TradeType.EXACT_OUTPUT,
	    swapType: V3SwapType.SINGLE_HOP,
	    investor: investor,
	    tokenIn: tokenIn,
	    tokenOut: tokenOut,
	    recipient: fundAddress,
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
	investor: string,
	tokens: string[],
  amountIn: BigNumber,
  amountOutMinimum: BigNumber,
	fundAddress: string
): V3TradeParams[] {
  const path = encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
	const params: V3TradeParams[] = [
		{
			tradeType: V3TradeType.EXACT_INPUT,
			swapType: V3SwapType.MULTI_HOP,
			investor: investor,
			tokenIn: NULL_ADDRESS,
			tokenOut: NULL_ADDRESS,
			recipient: fundAddress,
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
	investor: string,
	tokens: string[],
	amountOut: BigNumber,
	amountInMaximum: BigNumber,
	fundAddress: string
): V3TradeParams[] {
	const path = encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
	const params: V3TradeParams[] = [
		{
			tradeType: V3TradeType.EXACT_OUTPUT,
			swapType: V3SwapType.MULTI_HOP,
			investor: investor,
			tokenIn: NULL_ADDRESS,
			tokenOut: NULL_ADDRESS,
			recipient: fundAddress,
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