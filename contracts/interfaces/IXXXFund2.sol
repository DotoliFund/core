// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './ISwapManager.sol';
import './ILiquidityManager.sol';
import './IToken.sol';

interface IXXXFund2 is ISwapManager, ILiquidityManager, IToken {

    event Initialize(address indexed fund, address manager);
    event ManagerFeeIn(
        address indexed fund,
        address indexed investor,
        address indexed manager,
        address token,
        uint256 amount,
        uint256 amountETH
    );
    event ManagerFeeOut(
        address indexed fund,
        address indexed manager,
        address token,
        uint256 amount,
        uint256 amountETH
    );
    event Deposit(
        address indexed fund,
        address indexed manager,
        address indexed investor,
        address token,
        uint256 amount,
        uint256 amountETH
    );
    event Withdraw(
        address indexed fund,
        address indexed manager,
        address indexed investor,
        address token,
        uint256 amount,
        uint256 feeAmount,
        uint256 amountETH
    );
    event Swap(
        address indexed fund,
        address indexed manager,
        address indexed investor,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 amountETH
    );

    function manager() external view returns (address);

    function initialize(address _manager) external;    
    function deposit(address _token, uint256 _amount) external payable;
    function withdraw(address _token, uint256 _amount) external payable;
    function swap(
        V3TradeParams[] memory trades
    ) external payable;
    function mintNewPosition(V3MintParams memory params) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function increaseLiquidity(V3IncreaseLiquidityParams memory params) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);
    function collectAllFees(V3CollectParams memory params) external returns (uint256 amount0, uint256 amount1);
    function decreaseLiquidity(V3DecreaseLiquidityParams memory params) external returns (uint256 amount0, uint256 amount1);

    function feeOut(address _token, uint256 _amount) external payable;

    function getFundTokens() external returns (Token[] memory);
    function getFeeTokens() external returns (Token[] memory);
    function getInvestorTokens(address investor) external returns (Token[] memory);

    function getInvestorTokenAmount(address investor, address token) external returns (uint256);

    function getInvestorTotalValueLockedETH(address investor) external returns (uint256);
    function getManagerFeeTotalValueLockedETH() external returns (uint256);
    function getETHPriceInUSD() external returns (uint256);
}