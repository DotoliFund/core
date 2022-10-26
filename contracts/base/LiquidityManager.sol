// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-core/contracts/libraries/TickMath.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@uniswap/v3-periphery/contracts/base/LiquidityManagement.sol';

import '../interfaces/ILiquidityManager.sol';
import './Constants.sol';

abstract contract LiquidityManager is ILiquidityManager, IERC721Receiver, Constants {

    uint24 public constant poolFee = 3000;

    // position deposit
    /// @notice Represents the deposit of an NFT
    struct pDeposit {
        address owner;
        uint128 liquidity;
        address token0;
        address token1;
    }

    /// @dev deposits[tokenId] => pDeposit
    mapping(uint256 => pDeposit) public deposits;

    // Implementing `onERC721Received` so this contract can receive custody of erc721 tokens
    function onERC721Received(
        address operator,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        // get position information

        _createDeposit(operator, tokenId);

        return this.onERC721Received.selector;
    }

    function _createDeposit(address owner, uint256 tokenId) internal {
        (, , address token0, address token1, , , , uint128 liquidity, , , , ) =
            INonfungiblePositionManager(nonfungiblePositionManager).positions(tokenId);

        // set the owner and data for position
        // operator is msg.sender
        deposits[tokenId] = pDeposit({owner: owner, liquidity: liquidity, token0: token0, token1: token1});
    }

    function _mintNewPosition(V3MintParams memory params)
        internal
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        // Approve the position manager
        TransferHelper.safeApprove(params.token0, nonfungiblePositionManager, params.amount0Desired);
        TransferHelper.safeApprove(params.token1, nonfungiblePositionManager, params.amount1Desired);

        // Note that the pool defined by DAI/USDC and fee tier 0.3% must already be created and initialized in order to mint
        //(tokenId, liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).mint(params);

        INonfungiblePositionManager.MintParams memory params =
            INonfungiblePositionManager.MintParams({
                token0: params.token0,
                token1: params.token1,
                fee: params.fee,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                amount0Desired: params.amount0Desired,
                amount1Desired: params.amount1Desired,
                amount0Min: params.amount0Min,
                amount1Min: params.amount1Min,
                recipient: params.recipient,
                deadline: params.deadline
            });

        // Create a deposit
        _createDeposit(msg.sender, tokenId);
    }

    function _collectAllFees(V3CollectParams memory params) internal returns (uint256 amount0, uint256 amount1) {
        // Caller must own the ERC721 position, meaning it must be a deposit
        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).collect(params);
    }

    function _decreaseLiquidity(V3DecreaseLiquidityParams memory params) internal returns (uint256 amount0, uint256 amount1) {
        // caller must be the owner of the NFT
        uint256 tokenId = params.tokenId;
        require(msg.sender == deposits[tokenId].owner, 'Not the owner');
        // get liquidity data for tokenId
        uint128 liquidity = deposits[tokenId].liquidity;
        uint128 halfLiquidity = liquidity / 2;

        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).decreaseLiquidity(params);
    }

    function _increaseLiquidity(V3IncreaseLiquidityParams memory params)
        internal
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        ) {
        uint256 tokenId = params.tokenId;
        TransferHelper.safeApprove(deposits[tokenId].token0, nonfungiblePositionManager, params.amount0Desired);
        TransferHelper.safeApprove(deposits[tokenId].token1, nonfungiblePositionManager, params.amount1Desired);
        (liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).increaseLiquidity(params);
    }

    function _sendToOwner(
        uint256 tokenId,
        uint256 amount0,
        uint256 amount1
    ) internal {
        // get owner of contract
        address owner = deposits[tokenId].owner;

        address token0 = deposits[tokenId].token0;
        address token1 = deposits[tokenId].token1;
        // send collected fees to owner
        TransferHelper.safeTransfer(token0, owner, amount0);
        TransferHelper.safeTransfer(token1, owner, amount1);
    }

    /// @notice Transfers the NFT to the owner
    /// @param tokenId The id of the erc721
    function _retrieveNFT(uint256 tokenId) internal {
        // must be the owner of the NFT
        require(msg.sender == deposits[tokenId].owner, 'Not the owner');
        // transfer ownership to original owner
        INonfungiblePositionManager(nonfungiblePositionManager).safeTransferFrom(address(this), msg.sender, tokenId);
        //remove information related to tokenId
        delete deposits[tokenId];
    }
}