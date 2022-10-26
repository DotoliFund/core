// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';

import '../interfaces/IXXXFactory.sol';
import '../interfaces/ISwapManager.sol';

/// @title Uniswap V3 Swap Router
abstract contract SwapManager is ISwapManager {
    using Path for bytes;

    function getLastTokenFromPath(bytes memory path) internal view returns (address) {
        address _tokenOut;

        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
                _tokenOut = tokenOut;
                break;
            }
        }
        return _tokenOut;
    }
    
    function exactInputSingle(address factory, address swapRouter, V3TradeParams calldata trade) internal returns (uint256 amountOut) {
        require(IXXXFactory(factory).isWhiteListToken(trade.tokenOut), 
            'exactInputSingle() => not whitelist token');

        // approve
        IERC20Minimal(trade.tokenIn).approve(swapRouter, trade.amountIn);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter02.ExactInputSingleParams calldata params =
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: trade.tokenIn,
                tokenOut: trade.tokenOut,
                fee: trade.fee,
                recipient: address(this),
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum,
                sqrtPriceLimitX96: 0
            });
        amountOut = ISwapRouter02(swapRouter).exactInputSingle(params);
    }

    function exactInput(address factory, address swapRouter, V3TradeParams calldata trade, address tokenIn, address tokenOut) internal returns (uint256 amountOut) {
        require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
            'exactInput() => not whitelist token');

        // approve
        IERC20Minimal(tokenIn).approve(swapRouter, trade.amountIn);

        ISwapRouter02.ExactInputParams calldata params =
            IV3SwapRouter.ExactInputParams({
                path: trade.path,
                recipient: address(this),
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum
            });
        amountOut = ISwapRouter02(swapRouter).exactInput(params);
    }

    function exactOutputSingle(address factory, address swapRouter, V3TradeParams calldata trade) internal returns (uint256 amountIn) {
        require(IXXXFactory(factory).isWhiteListToken(trade.tokenOut), 
            'exactOutputSingle() => not whitelist token');

        // approve
        IERC20Minimal(trade.tokenIn).approve(swapRouter, trade.amountInMaximum);

        ISwapRouter02.ExactOutputSingleParams calldata params =
            IV3SwapRouter.ExactOutputSingleParams({
                tokenIn: trade.tokenIn,
                tokenOut: trade.tokenOut,
                fee: trade.fee,
                recipient: address(this),
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum,
                sqrtPriceLimitX96: 0
            });
        amountIn = ISwapRouter02(swapRouter).exactOutputSingle(params);
    }

    function exactOutput(address factory, address swapRouter, V3TradeParams calldata trade, address tokenIn, address tokenOut) internal returns (uint256 amountIn) {
        require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
            'exactOutput() => not whitelist token');

        // approve
        IERC20Minimal(tokenIn).approve(swapRouter, trade.amountInMaximum);

        ISwapRouter02.ExactOutputParams calldata params =
            IV3SwapRouter.ExactOutputParams({
                path: trade.path,
                recipient: address(this),
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum
            });
        amountIn = ISwapRouter02(swapRouter).exactOutput(params);
    }

}