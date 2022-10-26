// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

interface ILiquidityManager {

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    
    function mintNewPosition(MintParams calldata params) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    function increaseLiquidityCurrentRange(IncreaseLiquidityParams calldata params) 
        external returns (uint128 liquidity, uint256 amount0, uint256 amount1);


    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function collectAllFees(CollectParams calldata params) external returns (uint256 amount0, uint256 amount1);


    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    function decreaseLiquidityInHalf(DecreaseLiquidityParams calldata params) external returns (uint256 amount0, uint256 amount1);

}


    //   calldatas.push(
    //     NonfungiblePositionManager.INTERFACE.encodeFunctionData('mint', [
    //       {
    //         token0: position.pool.token0.address,
    //         token1: position.pool.token1.address,
    //         fee: position.pool.fee,
    //         tickLower: position.tickLower,
    //         tickUpper: position.tickUpper,
    //         amount0Desired: toHex(amount0Desired),
    //         amount1Desired: toHex(amount1Desired),
    //         amount0Min,
    //         amount1Min,
    //         recipient,
    //         deadline
    //       }
    //     ])
    //   )

    //   // increase
    //   calldatas.push(
    //     NonfungiblePositionManager.INTERFACE.encodeFunctionData('increaseLiquidity', [
    //       {
    //         tokenId: toHex(options.tokenId),
    //         amount0Desired: toHex(amount0Desired),
    //         amount1Desired: toHex(amount1Desired),
    //         amount0Min,
    //         amount1Min,
    //         deadline
    //       }
    //     ])
    //   )
    // }

    // // collect
    // calldatas.push(
    //   NonfungiblePositionManager.INTERFACE.encodeFunctionData('collect', [
    //     {
    //       tokenId,
    //       recipient: involvesETH ? ADDRESS_ZERO : recipient,
    //       amount0Max: MaxUint128,
    //       amount1Max: MaxUint128
    //     }
    //   ])
    // )

    // // remove liquidity
    // calldatas.push(
    //   NonfungiblePositionManager.INTERFACE.encodeFunctionData('decreaseLiquidity', [
    //     {
    //       tokenId,
    //       liquidity: toHex(partialPosition.liquidity),
    //       amount0Min: toHex(amount0Min),
    //       amount1Min: toHex(amount1Min),
    //       deadline
    //     }
    //   ])
    // )