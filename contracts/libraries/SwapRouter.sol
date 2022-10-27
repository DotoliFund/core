// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';

library SwapRouter {
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

    function exactInputSingle(
        address factory,
        address swapRouter,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut) {
        // approve
        IERC20Minimal(tokenIn).approve(swapRouter, amountIn);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter02.ExactInputSingleParams memory params =
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            });
        amountOut = ISwapRouter02(swapRouter).exactInputSingle(params);
    }

    function exactInput(
        address factory,
        address swapRouter,
        bytes calldata path,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address tokenIn
    ) internal returns (uint256 amountOut) {
        // approve
        IERC20Minimal(tokenIn).approve(swapRouter, amountIn);

        ISwapRouter02.ExactInputParams memory params =
            IV3SwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum
            });
        amountOut = ISwapRouter02(swapRouter).exactInput(params);
    }

    function exactOutputSingle(
        address factory,
        address swapRouter,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountOut,
        uint256 amountInMaximum
    ) internal returns (uint256 amountIn) {
        // approve
        IERC20Minimal(tokenIn).approve(swapRouter, amountInMaximum);

        ISwapRouter02.ExactOutputSingleParams memory params =
            IV3SwapRouter.ExactOutputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            });
        amountIn = ISwapRouter02(swapRouter).exactOutputSingle(params);
        // For exact output swaps, the amountInMaximum may not have all been spent.
        // If the actual amount spent (amountIn) is less than the specified maximum amount, we approve the swapRouter to spend 0.
        if (amountIn < amountInMaximum) {
            IERC20Minimal(tokenIn).approve(swapRouter, 0);
        }
    }

    function exactOutput(
        address factory,
        address swapRouter,
        bytes calldata path,
        uint256 amountOut,
        uint256 amountInMaximum,
        address tokenIn
    ) internal returns (uint256 amountIn) {
        // approve
        IERC20Minimal(tokenIn).approve(swapRouter, amountInMaximum);

        ISwapRouter02.ExactOutputParams memory params =
            IV3SwapRouter.ExactOutputParams({
                path: path,
                recipient: address(this),
                amountOut: amountOut,
                amountInMaximum: amountInMaximum
            });
        amountIn = ISwapRouter02(swapRouter).exactOutput(params);
        // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we approve the router to spend 0.
        if (amountIn < amountInMaximum) {
            IERC20Minimal(tokenIn).approve(swapRouter, 0);
        }
    }
}