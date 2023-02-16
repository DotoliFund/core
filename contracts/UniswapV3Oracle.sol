// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/pool/IUniswapV3PoolState.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import './libraries/FullMath.sol';
import './libraries/TickMath.sol';
import './libraries/SqrtPriceMath.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/IUniswapV3Oracle.sol';


contract UniswapV3Oracle is IUniswapV3Oracle{
    using SafeCast for uint256;
    using SafeCast for int256;

    address public uniswapV3Factory;
    address public nonfungiblePositionManager;
    address public weth9;

    constructor(address _uniswapV3Factory, address _nonfungiblePositionManager, address _weth9) {
        uniswapV3Factory = _uniswapV3Factory;
        nonfungiblePositionManager = _nonfungiblePositionManager;
        weth9 = _weth9;
    }

    function getPoolAddress(address token0, address token1, uint24 fee) private view returns (address) {
        return IUniswapV3Factory(uniswapV3Factory).getPool(token0, token1, fee);
    }

    function getPositionTokenAmount(uint256 tokenId) external view override returns (
        address token0,
        address token1,
        int256 amount0,
        int256 amount1
    ) {
        (, , address _token0, address _token1, uint24 fee, 
            int24 tickLower, int24 tickUpper, uint128 liquidity, , , , ) 
            = INonfungiblePositionManager(nonfungiblePositionManager).positions(tokenId);

        token0 = _token0;
        token1 = _token1;

        address poolAddress = getPoolAddress(token0, token1, fee);
        (uint160 sqrtPriceX96, int24 tick, , , , ,) = IUniswapV3PoolState(poolAddress).slot0();

        if (liquidity != 0) {
            if (tick < tickLower) {
                amount0 = SqrtPriceMath.getAmount0Delta(
                    TickMath.getSqrtRatioAtTick(tickLower),
                    TickMath.getSqrtRatioAtTick(tickUpper),
                    int128(liquidity)
                );
            } else if (tick < tickUpper) {
                amount0 = SqrtPriceMath.getAmount0Delta(
                    sqrtPriceX96,
                    TickMath.getSqrtRatioAtTick(tickUpper),
                    int128(liquidity)
                );
                amount1 = SqrtPriceMath.getAmount1Delta(
                    TickMath.getSqrtRatioAtTick(tickLower),
                    sqrtPriceX96,
                    int128(liquidity)
                );
            } else {
                amount1 = SqrtPriceMath.getAmount1Delta(
                    TickMath.getSqrtRatioAtTick(tickLower),
                    TickMath.getSqrtRatioAtTick(tickUpper),
                    int128(liquidity)
                );
            }
        }
    }

    function checkWhiteListToken(address _token, uint256 minPoolAmount) external view override returns (bool) {
        uint16[3] memory fees = [500, 3000, 10000];
        uint256 poolAmount = 0;

        for (uint256 i=0; i<fees.length; i++) {
            address pool = IUniswapV3Factory(uniswapV3Factory).getPool(_token, weth9, uint24(fees[i]));
            if (pool == address(0)) {
                continue;
            }
            address token0 = IUniswapV3Pool(pool).token0();
            address token1 = IUniswapV3Pool(pool).token1();
            uint256 token0Decimal = 10 ** IERC20Minimal(token0).decimals();
            uint256 token1Decimal = 10 ** IERC20Minimal(token1).decimals();

            uint256 amount0 = IERC20Minimal(token0).balanceOf(pool);
            uint256 amount1 = IERC20Minimal(token1).balanceOf(pool);
            (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();

            uint256 numerator = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
            uint256 price0 = FullMath.mulDiv(numerator, token0Decimal, 1 << 192);
            //tokenPriceInWETH
            if (token0 == weth9) {
                poolAmount += ((amount1 / price0) * token1Decimal) + amount0;
            } else if (token1 == weth9) {
                poolAmount += ((amount0 / token0Decimal) * price0) + amount1;
            } else {
                continue;
            }        
        }

        if (poolAmount >= minPoolAmount) {
            return true;
        } else {
            return false;
        }
    }
}