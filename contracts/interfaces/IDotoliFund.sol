// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './IToken.sol';
import './IRouter.sol';

interface IDotoliFund is IToken {
    event FundCreated();
    event NewFund(uint256 fundId, address indexed investor);
    event Subscribe(uint256 fundId, address indexed investor);
    event ManagerFeeIn(address indexed investor, address token, uint256 amount);
    event ManagerFeeOut(address token, uint256 amount);
    event Deposit(address indexed investor, address token, uint256 amount);
    event Withdraw(address indexed investor, address token, uint256 amount, uint256 feeAmount);
    event Swap(address indexed investor, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event MintNewPosition(address indexed investor, address token0, address token1, uint256 amount0, uint256 amount1);
    event IncreaseLiquidity(address indexed investor, address token0, address token1, uint256 amount0, uint256 amount1);
    event CollectPositionFee(address indexed investor, address token0, address token1, uint256 amount0, uint256 amount1);
    event DecreaseLiquidity(address indexed investor, address token0, address token1, uint256 amount0, uint256 amount1);

    function createFund() external returns (uint256 fundId);
    function deposit(uint256 fundId, address _token, uint256 _amount) external payable;
    function withdraw(uint256 fundId, address _token, uint256 _amount) external payable;
    function feeOut(uint256 fundId, address _token, uint256 _amount) external payable;
    function swap(IRouter.SwapParams[] calldata trades) external payable;
    function mintNewPosition(IRouter.MintParams calldata params) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function increaseLiquidity(IRouter.IncreaseParams calldata params) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);
    function collectPositionFee(IRouter.CollectParams calldata params) external returns (uint256 amount0, uint256 amount1);
    function decreaseLiquidity(IRouter.DecreaseParams calldata params) external returns (uint256 amount0, uint256 amount1);

    function isSubscribed(address investor, uint256 fundId) external view returns (bool);
    function subscribedFunds(address investor) external view returns (uint256[] memory);
    function subscribe(uint256 fundId) external;

    function getInvestorTokens(uint256 fundId, address investor) external returns (Token[] memory);
    function getFeeTokens(uint256 fundId) external returns (Token[] memory);
    function getInvestorTokenAmount(uint256 fundId, address investor, address token) external returns (uint256);
    function getPositionTokenIds(address investor) external returns (uint256[] memory);
}