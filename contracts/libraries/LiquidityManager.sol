// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;


//import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
//import '@uniswap/v3-core/contracts/libraries/TickMath.sol';
//import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
//import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import '@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol';
//import '@uniswap/v3-periphery/contracts/base/LiquidityManagement.sol';

library LiquidityManager {

    // position deposit
    /// @notice Represents the deposit of an NFT
    struct pDeposit {
        address owner;
        uint128 liquidity;
        address token0;
        address token1;
    }

    // /// @dev deposits[tokenId] => pDeposit
    // mapping(uint256 => pDeposit) public deposits;

    // // Implementing `onERC721Received` so this contract can receive custody of erc721 tokens
    // function onERC721Received(
    //     address operator,
    //     address,
    //     uint256 tokenId,
    //     bytes calldata
    // ) external override returns (bytes4) {
    //     // get position information

    //     _createDeposit(operator, tokenId);

    //     return this.onERC721Received.selector;
    // }

    function _createDeposit(
        address nonfungiblePositionManager,
        address owner,
        uint256 tokenId
    ) internal {
        (, , address token0, address token1, , , , uint128 liquidity, , , , ) =
            INonfungiblePositionManager(nonfungiblePositionManager).positions(tokenId);

        // set the owner and data for position
        // operator is msg.sender
        // deposits[tokenId] = pDeposit({owner: owner, liquidity: liquidity, token0: token0, token1: token1});
    }

    function mintNewPosition(
        address nonfungiblePositionManager,
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
        //uint256 deadline
    )
        internal
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        // Approve the position manager
        //IERC20Minimal(token0).approve(nonfungiblePositionManager, amount0Desired);
        //IERC20Minimal(token1).approve(nonfungiblePositionManager, amount1Desired);

        INonfungiblePositionManager.MintParams memory params =
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                recipient: address(this),
                deadline: 111111111 //TODO : change 
            });

        // Note that the pool defined by DAI/USDC and fee tier 0.3% must already be created and initialized in order to mint
        (tokenId, liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).mint(params);

        // Create a deposit
        _createDeposit(nonfungiblePositionManager, msg.sender, tokenId);
    }

    function collectAllFees(
        address nonfungiblePositionManager,
        uint256 tokenId,
        uint128 amount0Max,
        uint128 amount1Max
    ) internal returns (uint256 amount0, uint256 amount1) {
        INonfungiblePositionManager.CollectParams memory params =
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: amount0Max,
                amount1Max: amount1Max
            });
        // Caller must own the ERC721 position, meaning it must be a deposit
        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).collect(params);
    }

    function decreaseLiquidity(
        address nonfungiblePositionManager,
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
        //uint256 deadline
    ) internal returns (uint256 amount0, uint256 amount1) {

        // caller must be the owner of the NFT
        //require(msg.sender == deposits[tokenId].owner, 'Not the owner');

        INonfungiblePositionManager.DecreaseLiquidityParams memory params =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: 111111111 //TODO : change
            });

        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).decreaseLiquidity(params);
    }

    function increaseLiquidity(
        address nonfungiblePositionManager,
        uint256 tokenId,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
        //uint256 deadline
    )
        internal
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        ) {
        //IERC20Minimal(deposits[tokenId].token0).approve(nonfungiblePositionManager, amount0Desired);
        //IERC20Minimal(deposits[tokenId].token1).approve(nonfungiblePositionManager, amount1Desired);

        INonfungiblePositionManager.IncreaseLiquidityParams memory params =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: 111111111 //TODO : change
            });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).increaseLiquidity(params);
    }

    // function _sendToOwner(
    //     uint256 tokenId,
    //     uint256 amount0,
    //     uint256 amount1
    // ) internal {
    //     // get owner of contract
    //     address owner = deposits[tokenId].owner;

    //     address token0 = deposits[tokenId].token0;
    //     address token1 = deposits[tokenId].token1;
    //     // send collected fees to owner
    //     IERC20Minimal(token0).transfer(owner, amount0);
    //     IERC20Minimal(token1).transfer(owner, amount1);
    // }

    // /// @notice Transfers the NFT to the owner
    // /// @param tokenId The id of the erc721
    // function _retrieveNFT(uint256 tokenId) internal {
    //     // must be the owner of the NFT
    //     require(msg.sender == deposits[tokenId].owner, 'Not the owner');
    //     // transfer ownership to original owner
    //     INonfungiblePositionManager(nonfungiblePositionManager).safeTransferFrom(address(this), msg.sender, tokenId);
    //     //remove information related to tokenId
    //     delete deposits[tokenId];
    // }

}