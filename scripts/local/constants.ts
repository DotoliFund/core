import type {
  BigNumber
} from "ethers";

export const NEW_FUND_ADDRESS = '0x67feb4b7ed0e3fe9644943abf67f7cb5e579ef09'
export const WETH9_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export const WETH9_RINKEBY = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
export const UNI_ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
export const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45';
export const AmountOutMinimum = 8136490171282445;
export const DEPOSIT_AMOUNT =   8000000000000000;

export type V3TradeParamsStruct = {
	tradeType: number;
	swapType: number;
	investor: string;
	tokenIn: string;
	tokenOut: string;
	recipient: string;
	fee: number;
	amountIn: BigNumber;
	amountOut: BigNumber;
	amountInMaximum: BigNumber;
	amountOutMinimum: BigNumber;
	sqrtPriceLimitX96: BigNumber;
	path: string;
};

export type ExactInputSingleParams = {
	tokenIn: string;
	tokenOut: string;
	fee: number;
	recipient: string;
	amountIn: BigNumber;
	amountOutMinimum: BigNumber;
	sqrtPriceLimitX96: BigNumber;
};