// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface ISwapRouter {

    enum SwapType{
        EXACT_INPUT_SINGLE_HOP,
        EXACT_INPUT_MULTI_HOP,
        EXACT_OUTPUT_SINGLE_HOP,
        EXACT_OUTPUT_MULTI_HOP
    }

    struct SwapParams {
        SwapType swapType;
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
        bytes path;
    }
    
    function getLastTokenFromPath(bytes memory path) external view returns (address);
    function swapRouter(SwapParams calldata trades) external returns (uint256);
}



