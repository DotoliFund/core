// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';

interface IXXXFund2 {

    struct Token {
        address tokenAddress;
        uint256 amount;
    }

    event Create(address fund, address manager);
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

    function initialize(address _manager) external;    

    function deposit(address _token, uint256 _amount) external payable;
    function withdraw(address _token, uint256 _amount) external payable;
    function swap(
        V3TradeParams[] calldata trades
    ) external payable;

    function getInvestorTokenCount(address investor) external returns (uint256);
    function getInvestorTokens(address investor) external returns (Token[] memory);
    function getInvestorTokenAmount(address investor, address token) external returns (uint256);
    function getRewardTokens() external returns (Token[] memory);
}