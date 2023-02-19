// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface ILiquidityRouter {

    struct MintParams {
        uint256 fundId;
        address investor;
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }
        
    struct IncreaseParams {
        uint256 fundId;
        address investor;
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 fundId;
        address investor;
        uint256 tokenId;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    struct DecreaseParams {
        uint256 fundId;
        address investor;
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    function onERC721Received(address operator, address, uint256 tokenId, bytes calldata) external returns (bytes4);
    function getLiquidityToken(uint256 tokenId) external view returns (address token0, address token1);    
    function getPositionTokenAmount(uint256 tokenId) external view returns (
        address token0,
        address token1,
        int256 amount0,
        int256 amount1
    );

    function mint(MintParams calldata params) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function increase(IncreaseParams calldata params) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);
    function collect(CollectParams calldata params) external returns (uint256 amount0, uint256 amount1);
    function decrease(DecreaseParams calldata params) external returns (uint256 amount0, uint256 amount1);
}



