// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface IPriceOracle {
    function getPriceETH(address token, uint128 amountIn, address weth) external view returns (uint256);
    function getPriceUSD(address token, uint128 amountIn, address usd) external view returns (uint256);
    function getETHPriceInUSD(address weth, address usd) external view returns (uint256);
    function getUSDPriceInETH(address usd, address weth) external view returns (uint256);
}