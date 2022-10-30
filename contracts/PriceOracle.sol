// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';

import './interfaces/IPriceOracle.sol';

/// @title PriceOracle library
/// @notice Provides functions to integrate with V3 pool oracle
contract PriceOracle is IPriceOracle{

    address public factory;

    constructor() {
        // Uniswap V3 Factory address
        factory = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    }

    function getBestPool(
        address token0, 
        address token1
    ) internal view returns (address bestPool) {
        uint128 fee500PoolLiquiduty = 0;
        uint128 fee3000PoolLiquiduty = 0;
        uint128 fee10000PoolLiquiduty = 0;

        address fee500Pool = IUniswapV3Factory(factory).getPool(
            token0,
            token1,
            500
        );
        address fee3000Pool = IUniswapV3Factory(factory).getPool(
            token0,
            token1,
            3000
        );
        address fee10000Pool = IUniswapV3Factory(factory).getPool(
            token0,
            token1,
            10000
        );

        if (fee500Pool == address(0)) {
            fee500PoolLiquiduty = 0;
        } else {
            fee500PoolLiquiduty = IUniswapV3Pool(fee500Pool).liquidity();
        }
        if (fee3000Pool == address(0)) {
            fee3000PoolLiquiduty = 0;
        } else {
            fee3000PoolLiquiduty = IUniswapV3Pool(fee3000Pool).liquidity();
        }
        if (fee10000Pool == address(0)) {
            fee10000PoolLiquiduty = 0;
        } else {
            fee10000PoolLiquiduty = IUniswapV3Pool(fee10000Pool).liquidity();
        }

        bestPool = address(0);

        if (fee500PoolLiquiduty >= fee3000PoolLiquiduty && fee500PoolLiquiduty >= fee10000PoolLiquiduty) {
            bestPool = fee500Pool;
        } else if (fee3000PoolLiquiduty >= fee500PoolLiquiduty && fee3000PoolLiquiduty >= fee10000PoolLiquiduty) {
            bestPool = fee3000Pool;
        } else if (fee10000PoolLiquiduty >= fee500PoolLiquiduty && fee10000PoolLiquiduty >= fee3000PoolLiquiduty) {
            bestPool = fee10000Pool;
        }

        return bestPool;
    }

    function getBestPoolPrice(
        address _token0, 
        address _token1,
        address tokenIn,
        uint128 amountIn,
        uint32 secondsAgo
    ) internal view returns (uint256 amountOut) {
        address token0 = _token0;
        address token1 = _token1;
        require(tokenIn == token0 || tokenIn == token1, "invalid token");

        address pool = getBestPool(token0, token1);
        require(pool != address(0), "no pool exist");

        address tokenOut = tokenIn == token0 ? token1 : token0;

        // (int24 tick, ) = OracleLibrary.consult(pool, secondsAgo);

        // Code copied from OracleLibrary.sol, consult()
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        // int56 since tick * time = int24 * uint32
        // 56 = 24 + 32
        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(pool).observe(
            secondsAgos
        );

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

        // int56 / uint32 = int24
        int24 tick = int24(tickCumulativesDelta / secondsAgo);
        // Always round to negative infinity
        /*
        int doesn't round down when it is negative
        int56 a = -3
        -3 / 10 = -3.3333... so round down to -4
        but we get
        a / 10 = -3
        so if tickCumulativeDelta < 0 and division has remainder, then round
        down
        */
        if (
            tickCumulativesDelta < 0 && (tickCumulativesDelta % secondsAgo != 0)
        ) {
            tick--;
        }

        amountOut = OracleLibrary.getQuoteAtTick(
            tick,
            amountIn,
            tokenIn,
            tokenOut
        );
    }

    function getPriceETH(address token, uint128 amountIn, address weth) external override view returns (uint256 amount) {
        if (token == weth) {
            return uint128(amountIn);
        } else {
            return getBestPoolPrice(
                token,
                weth,
                token,
                amountIn, 
                10
            );
        }
    }

    function getPriceUSD(address token, uint128 amountIn, address usd) external override view returns (uint256 amount) {
        if (token == usd) {
            return uint128(amountIn);
        } else {
            return getBestPoolPrice(
                token,
                usd,
                token,
                amountIn,
                10
            );
        }
    }
}