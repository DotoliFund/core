// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/pool/IUniswapV3PoolState.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import './libraries/FullMath.sol';
import './libraries/TickMath.sol';
import './libraries/SqrtPriceMath.sol';
import './interfaces/ILiquidityOracle.sol';

contract LiquidityOracle is ILiquidityOracle{
    using SafeCast for uint256;
    using SafeCast for int256;

    address public UniswapV3Factory;
    address public NonfungiblePositionManager;

    constructor(address uniswapV3Factory, address nonfungiblePositionManager) {
        UniswapV3Factory = uniswapV3Factory;
        NonfungiblePositionManager = nonfungiblePositionManager;
    }

    function getPoolAddress(address token0, address token1, uint24 fee) private view returns (address) {
        return IUniswapV3Factory(UniswapV3Factory).getPool(token0, token1, fee);
    }

    function getPositionTokenAmount(uint256 tokenId) external override view returns (
        address token0,
        address token1,
        int256 amount0,
        int256 amount1
    ) {
        (, , address _token0, address _token1, uint24 fee, 
            int24 tickLower, int24 tickUpper, uint128 liquidity, , , , ) 
            = INonfungiblePositionManager(NonfungiblePositionManager).positions(tokenId);

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
}