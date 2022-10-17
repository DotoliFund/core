// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';
import '../interfaces/IERC20.sol';

/// @title PriceOracle library
/// @notice Provides functions to integrate with V3 pool oracle
library PriceOracle {

    function getBestPool(
        address factory,
        address token0, 
        address token1
    ) private view returns (address pool) {
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

        address pool = address(0);

        if (fee500PoolLiquiduty >= fee3000PoolLiquiduty) {
            if (fee500PoolLiquiduty >= fee10000PoolLiquiduty) {
                pool = fee500Pool;
            }
        } else if (fee3000PoolLiquiduty >= fee500PoolLiquiduty) {
            if (fee3000PoolLiquiduty >= fee10000PoolLiquiduty) {
                pool = fee3000Pool;
            }
        } else if (fee10000PoolLiquiduty >= fee500PoolLiquiduty) {
            if (fee10000PoolLiquiduty >= fee3000PoolLiquiduty) {
                pool = fee10000Pool;
            }
        }

        return pool;
    }

    function getBestPoolPrice(
        address factory,
        address _token0, 
        address _token1,
        address tokenIn,
        uint128 amountIn,
        uint32 secondsAgo
    ) internal view returns (uint256 amountOut) {
        address token0 = _token0;
        address token1 = _token1;
        require(tokenIn == token0 || tokenIn == token1, "getPrice() => invalid token");

        address pool = getBestPool(factory, token0, token1);
        require(pool != address(0), "getPrice() => pool doesn't exist");

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

    function getBestPoolPriceETH(address factory, address token, address weth) internal view returns (uint256 amount) {
        if (token == weth) {
            return 10**18;
        } else {
            return getBestPoolPrice(
                factory,
                token,
                weth, //weth
                token, //token
                IERC20(token).decimals(), 
                10
            );
        }
    }

    function getBestPoolPriceUSD(address factory, address token, address usd) internal view returns (uint256 amount) {
        if (token == usd) {
            return 10**6;
        } else {
            return getBestPoolPrice(
                factory,
                token,
                usd, //0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, //USDC
                token, //token
                IERC20(token).decimals(),
                10
            );
        }
    }

    // function getPrice(
    // 	address factory,
    //     address _token0, 
    //     address _token1, 
    //     uint24 _fee,
    //     address tokenIn,
    //     uint128 amountIn,
    //     uint32 secondsAgo
    // ) internal view returns (uint256 amountOut) {
    //     address token0 = _token0;
    //     address token1 = _token1;
    //     uint24 fee = _fee;

    //     address pool = IUniswapV3Factory(factory).getPool(
    //         _token0,
    //         _token1,
    //         _fee
    //     );
    //     require(pool != address(0), "getPrice() => pool doesn't exist");

    //     require(tokenIn == token0 || tokenIn == token1, "getPrice() => invalid token");

    //     address tokenOut = tokenIn == token0 ? token1 : token0;

    //     // (int24 tick, ) = OracleLibrary.consult(pool, secondsAgo);

    //     // Code copied from OracleLibrary.sol, consult()
    //     uint32[] memory secondsAgos = new uint32[](2);
    //     secondsAgos[0] = secondsAgo;
    //     secondsAgos[1] = 0;

    //     // int56 since tick * time = int24 * uint32
    //     // 56 = 24 + 32
    //     (int56[] memory tickCumulatives, ) = IUniswapV3Pool(pool).observe(
    //         secondsAgos
    //     );

    //     int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

    //     // int56 / uint32 = int24
    //     int24 tick = int24(tickCumulativesDelta / secondsAgo);
    //     // Always round to negative infinity
    //     /*
    //     int doesn't round down when it is negative
    //     int56 a = -3
    //     -3 / 10 = -3.3333... so round down to -4
    //     but we get
    //     a / 10 = -3
    //     so if tickCumulativeDelta < 0 and division has remainder, then round
    //     down
    //     */
    //     if (
    //         tickCumulativesDelta < 0 && (tickCumulativesDelta % secondsAgo != 0)
    //     ) {
    //         tick--;
    //     }

    //     amountOut = OracleLibrary.getQuoteAtTick(
    //         tick,
    //         amountIn,
    //         tokenIn,
    //         tokenOut
    //     );
    // }

    // function getPriceETH(address factory, address token, address weth, uint24 fee) internal view returns (uint256 amount) {
    //     if (token == weth) {
    //         return 10**18;
    //     } else {
    //         return getPrice(
    //         	factory,
    //             token,
    //             weth, //weth
    //             fee, 
    //             token, //token
    //             IERC20(token).decimals(), 
    //             10
    //         );
    //     }
    // }

    // function getPriceUSD(address factory, address token, address usd, uint24 fee) internal view returns (uint256 amount) {
    //     if (token == usd) {
    //         return 10**6;
    //     } else {
    //         return getPrice(
    //         	factory,
    //             token,
    //             usd, //0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, //USDC
    //             fee, 
    //             token, //token
    //             IERC20(token).decimals(),
    //             10
    //         );
    //     }
    // }
}