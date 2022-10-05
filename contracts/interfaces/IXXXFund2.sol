// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import './ISwapRouter.sol';

interface IXXXFund2 is ISwapRouter{

    struct Token {
        address tokenAddress;
        uint256 amount;
    }

    event Initialize(address manager);
    event ManagerDeposit(
        address indexed manager, 
        address token, 
        uint256 amount,
        uint256 volumeETH, 
        uint256 volumeUSD
    );
    event ManagerWithdraw(
        address indexed manager, 
        address token, 
        uint256 amount,
        uint256 volumeETH, 
        uint256 volumeUSD
    );
    event ManagerFeeIn(
        address indexed investor, 
        address indexed manager, 
        address token, 
        uint256 amount,
        uint256 volumeETH, 
        uint256 volumeUSD
    );
    event ManagerFeeOut(
        address indexed manager,
        address token, 
        uint256 amount,
        uint256 volumeETH, 
        uint256 volumeUSD
    );
    event InvestorDeposit(
        address indexed investor, 
        address token, 
        uint256 amount,
        uint256 volumeETH, 
        uint256 volumeUSD
    );
    event InvestorWithdraw(
        address indexed investor, 
        address token, 
        uint256 amount, 
        uint256 feeAmount,
        uint256 volumeETH, 
        uint256 volumeUSD
    );
    event Swap(
        address indexed manager,
        address indexed investor,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 volumeETH, 
        uint256 volumeUSD
    );

    function initialize(address _manager) external;    

    function deposit(address _token, uint256 _amount) external payable;
    function withdraw(address _token, uint256 _amount) external payable;
    function swap(
        V3TradeParams[] calldata trades
    ) external payable;

    function feeOut(address _token, uint256 _amount) external payable;

    function getFundTokens() external returns (Token[] memory);
    function getManagerTokens() external returns (Token[] memory);
    function getFeeTokens() external returns (Token[] memory);
    function getInvestorTokens(address investor) external returns (Token[] memory);

    function getUserTokenAmount(address investor, address token) external returns (uint256);
}