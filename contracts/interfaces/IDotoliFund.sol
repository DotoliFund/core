// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface IDotoliFund {
    event Deposit(uint256 fundId, address indexed investor, address token, uint256 amount);
    event Withdraw(uint256 fundId, address indexed investor, address token, uint256 amount, uint256 feeAmount);
    event Swap(uint256 fundId, address indexed investor, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event DepositFee(uint256 fundId, address indexed investor, address token, uint256 amount);
    event WithdrawFee(uint256 fundId, address indexed manager, address token, uint256 amount);
    event MintNewPosition(uint256 fundId, address indexed investor, address token0, address token1, uint256 amount0, uint256 amount1);
    event IncreaseLiquidity(uint256 fundId, address indexed investor, address token0, address token1, uint256 amount0, uint256 amount1);
    event CollectPositionFee(uint256 fundId, address indexed investor, address token0, address token1, uint256 amount0, uint256 amount1);
    event DecreaseLiquidity(uint256 fundId, address indexed investor, address token0, address token1, uint256 amount0, uint256 amount1);

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

    struct MintParams {
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
        
    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    function deposit(uint256 fundId, address _token, uint256 _amount) external;
    function withdraw(uint256 fundId, address _token, uint256 _amount) external payable;
    function swap(uint256 fundId, address investor, SwapParams[] calldata trades) external;
    function withdrawFee(uint256 fundId, address _token, uint256 _amount) external payable;
    function mintNewPosition(uint256 fundId, address investor, MintParams calldata params)
        external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function increaseLiquidity(uint256 fundId, address investor, IncreaseLiquidityParams calldata params)
        external returns (uint128 liquidity, uint256 amount0, uint256 amount1);
    function collectPositionFee(uint256 fundId, address investor, CollectParams calldata params)
        external returns (uint256 amount0, uint256 amount1);
    function decreaseLiquidity(uint256 fundId, address investor, DecreaseLiquidityParams calldata params)external returns (uint256 amount0, uint256 amount1);
}