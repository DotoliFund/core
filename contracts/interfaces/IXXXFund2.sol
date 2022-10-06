// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './ISwapRouter.sol';
import './IToken.sol';

interface IXXXFund2 is ISwapRouter, IToken {

    event Initialize(address manager);
    event ManagerDeposit(
        address indexed manager, 
        address token, 
        uint256 amount,
        uint256 amountETH, 
        uint256 amountUSD
    );
    event ManagerWithdraw(
        address indexed manager, 
        address token, 
        uint256 amount,
        uint256 amountETH, 
        uint256 amountUSD
    );
    event ManagerFeeIn(
        address indexed investor, 
        address indexed manager, 
        address token, 
        uint256 amount,
        uint256 amountETH, 
        uint256 amountUSD
    );
    event ManagerFeeOut(
        address indexed manager,
        address token, 
        uint256 amount,
        uint256 amountETH, 
        uint256 amountUSD
    );
    event InvestorDeposit(
        address indexed investor, 
        address token, 
        uint256 amount,
        uint256 amountETH, 
        uint256 amountUSD
    );
    event InvestorWithdraw(
        address indexed investor, 
        address token, 
        uint256 amount, 
        uint256 feeAmount,
        uint256 amountETH, 
        uint256 amountUSD
    );
    event Swap(
        address indexed manager,
        address indexed investor,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 amountETH, 
        uint256 amountUSD
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

    // for Test : external -> internal
    function getUserTokenAmount(address investor, address token) external returns (uint256);

    function getFundVolumeETH() external returns (uint256);
    function getFundVolumeUSD() external returns (uint256);

    function getManagerVolumeETH() external returns (uint256);
    function getManagerVolumeUSD() external returns (uint256);

    function getInvestorVolumeETH(address investor) external returns (uint256);
    function getInvestorVolumeUSD(address investor) external returns (uint256);
    
    function getManagerFeeVolumeETH() external returns (uint256);
    function getManagerFeeVolumeUSD() external returns (uint256);
}