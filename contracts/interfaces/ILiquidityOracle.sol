// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface ILiquidityOracle {
    function getPositionTokenAmount(uint256 tokenId) external view returns (
        address token0,
        address token1,
        int256 amount0,
        int256 amount1
    );
}