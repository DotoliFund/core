// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import './ISwapRouter.sol';

interface IXXXFund {

    struct Token {
        address tokenAddress;
        uint256 amount;
    }

    event Deposit(address indexed investor, address _token, uint256 _amount);
    event Withdraw(address indexed investor, address _token, uint256 _amount);
    event Swap(
        address indexed manager,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    enum V3TradeType{
        EXACT_INPUT,
        EXACT_OUTPUT
    }

    enum V3SwapType{
        SINGLE_HOP,
        MULTI_HOP
    }

    // /**
    //  * V3Trade for producing the arguments to send calls to the router.
    //  */
    struct V3Trade {
        V3TradeType tradeType;
        V3SwapType swapType;
        address input;
        address output;
        bytes path;
        uint256 inputAmount;
        uint256 outputAmount;
        uint256 amountInMaximum;
        uint256 amountOutMinimum;
    }

    // /**
    //  * SwapOptions for producing the arguments to send calls to the router.
    //  */
    struct SwapOptions {
        uint256 slippageTolerance;
        address recipient;
        uint256 deadlineOrPreviousBlockhash;
        uint256 inputTokenPermit;
        uint24 fee;
    }

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function swap(
        address invester,
        V3Trade[] calldata trades,
        SwapOptions calldata options
    ) external payable returns (uint256);

    function initialize(address _manager) external;
    
    function deposit(address investor, address _token, uint256 _amount) external;
    function withdraw(address _token, address to, uint256 _amount) external;
}