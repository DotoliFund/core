// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

/// @title Router token swapping functionality
/// @notice Functions for swapping tokens via Uniswap V3
interface ISwapRouter {

    enum V3TradeType{
        EXACT_INPUT,
        EXACT_OUTPUT
    }

    enum V3SwapType{
        SINGLE_HOP,
        MULTI_HOP
    }

    // /**
    //  * V3TradeParams for producing the arguments to send calls to the router.
    //  */
    struct V3TradeParams {
        V3TradeType tradeType;
        V3SwapType swapType;
        address investor;
        address tokenIn;
        address tokenOut;
        address recipient;
        uint24 fee;
        uint256 amountIn;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
        bytes path;
    }

    // function exactInputSingle(address factory, address swapRouter, V3TradeParams memory trade) private returns (uint256 amountOut);

    // function exactInput(address factory, address swapRouter, V3TradeParams memory trade, address tokenIn, address tokenOut) private returns (uint256 amountOut);

    // function exactOutputSingle(address factory, address swapRouter, V3TradeParams memory trade) private returns (uint256 amountIn);

    // function exactOutput(address factory, address swapRouter, V3TradeParams memory trade, address tokenIn, address tokenOut) private returns (uint256);

}
