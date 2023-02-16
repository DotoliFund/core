// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface IRouter {
    enum SwapType{
        EXACT_INPUT_SINGLE_HOP,
        EXACT_INPUT_MULTI_HOP,
        EXACT_OUTPUT_SINGLE_HOP,
        EXACT_OUTPUT_MULTI_HOP
    }

    struct SwapParams {
        SwapType swapType;
        address investor;
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

    struct MintParams {
        address investor;
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }
        
    struct IncreaseParams {
        address investor;
        uint256 tokenId;
        address token0;
        address token1;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        address investor;
        uint256 tokenId;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    struct DecreaseParams {
        address investor;
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    function swapRouter(SwapParams calldata trades) external payable returns (uint256);
    function mint(MintParams calldata params) external returns (uint256 tokenId, uint128 liquidity, address token0, address token1, uint256 amount0, uint256 amount1);
    function increase(IncreaseParams calldata params) external returns (uint128 liquidity, address token0, address token1, uint256 amount0, uint256 amount1);
    function collect(CollectParams calldata params) external returns (address token0, address token1, uint256 amount0, uint256 amount1);
    function decrease(DecreaseParams calldata params) external returns (address token0, address token1, uint256 amount0, uint256 amount1);
}