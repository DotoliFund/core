// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';

import './interfaces/IERC20Minimal.sol';
import './interfaces/IDotoliFactory.sol';

//TODO : remove console
import "hardhat/console.sol";

contract Router is IRouter {
    uint128 MAX_INT = 2**128 - 1;

    address public swapRouter = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address public nonfungiblePositionManager = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
    address public dotoliFactory;

    struct Deposit {
        address owner;
        uint128 liquidity;
        address token0;
        address token1;
    }

    /// @dev deposits[tokenId] => Deposit
    mapping(uint256 => Deposit) public deposits;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address _dotoliFactory) {
        dotoliFactory = _dotoliFactory;
    }

    function swap(SwapParams calldata trade) external payable override lock returns (uint256) {

        if (trades[i].swapType == SwapType.EXACT_INPUT_SINGLE_HOP) {
            IERC20Minimal(trades[i].tokenIn).transferFrom(msg.sender, address(this), trades[i].amountIn);
            IERC20Minimal(trades[i].tokenIn).approve(swapRouter, trades[i].amountIn);

            ISwapRouter02.ExactInputSingleParams memory params =
                IV3SwapRouter.ExactInputSingleParams({
                    tokenIn: trades[i].tokenIn,
                    tokenOut: trades[i].tokenOut,
                    fee: trades[i].fee,
                    recipient: msg.sender,
                    amountIn: trades[i].amountIn,
                    amountOutMinimum: trades[i].amountOutMinimum,
                    sqrtPriceLimitX96: 0
                });

            uint256 amountOut = ISwapRouter02(swapRouter).exactInputSingle(params);
            return amountOut;

        } else if (trades[i].swapType == SwapType.EXACT_INPUT_MULTI_HOP) {
            IERC20Minimal(trades[i].tokenIn).transferFrom(msg.sender, address(this), trades[i].amountIn);
            IERC20Minimal(trades[i].tokenIn).approve(swapRouter, trades[i].amountIn);

            ISwapRouter02.ExactInputParams memory params =
                IV3SwapRouter.ExactInputParams({
                    path: trades[i].path,
                    recipient: msg.sender,
                    amountIn: trades[i].amountIn,
                    amountOutMinimum: trades[i].amountOutMinimum
                });

            uint256 amountOut = ISwapRouter02(swapRouter).exactInput(params);
            return amountOut;

        } else if (trades[i].swapType == SwapType.EXACT_OUTPUT_SINGLE_HOP) {
            IERC20Minimal(trades[i].tokenIn).transferFrom(msg.sender, address(this), trades[i].amountInMaximum);
            IERC20Minimal(trades[i].tokenIn).approve(swapRouter, trades[i].amountInMaximum);

            ISwapRouter02.ExactOutputSingleParams memory params =
                IV3SwapRouter.ExactOutputSingleParams({
                    tokenIn: trades[i].tokenIn,
                    tokenOut: trades[i].tokenOut,
                    fee: trades[i].fee,
                    recipient: msg.sender,
                    amountOut: trades[i].amountOut,
                    amountInMaximum: trades[i].amountInMaximum,
                    sqrtPriceLimitX96: 0
                });

            uint256 amountIn = ISwapRouter02(swapRouter).exactOutputSingle(params);
            if (amountIn < trades[i].amountInMaximum) {
                IERC20Minimal(trades[i].tokenIn).approve(swapRouter, 0);
                IERC20Minimal(trades[i].tokenIn).transfer(msg.sender, trades[i].amountInMaximum - amountIn);
            }
            return amountIn;

        } else if (trades[i].swapType == SwapType.EXACT_OUTPUT_MULTI_HOP) {
            IERC20Minimal(trades[i].tokenIn).transferFrom(msg.sender, address(this), trades[i].amountInMaximum);
            IERC20Minimal(trades[i].tokenIn).approve(swapRouter, trades[i].amountInMaximum);

            ISwapRouter02.ExactOutputParams memory params =
                IV3SwapRouter.ExactOutputParams({
                    path: trades[i].path,
                    recipient: msg.sender,
                    amountOut: trades[i].amountOut,
                    amountInMaximum: trades[i].amountInMaximum
                });

            uint256 amountIn = ISwapRouter02(swapRouter).exactOutput(params);
            if (amountIn < trades[i].amountInMaximum) {
                IERC20Minimal(trades[i].tokenIn).approve(swapRouter, 0);
                IERC20Minimal(trades[i].tokenIn).transferFrom(address(this), msg.sender, trades[i].amountInMaximum - amountIn);
            }
            return amountIn;
        }
    }

    function _createDeposit(address owner, uint256 tokenId) internal {
        (, , address token0, address token1, , , , uint128 liquidity, , , , ) =
            INonfungiblePositionManager(nonfungiblePositionManager).positions(tokenId);

        // set the owner and data for position
        // operator is msg.sender
        deposits[tokenId] = Deposit({owner: owner, liquidity: liquidity, token0: token0, token1: token1});
    }

    function mintNewPosition(MintNewPositionParams calldata _params) external override 
        returns (uint256 tokenId, uint256 liquidity, address token0, address token1, uint256 amount0, uint256 amount1) 
    {
        IERC20Minimal(_params.token0).transferFrom(msg.sender, address(this), trades[i].amount0Desired);
        IERC20Minimal(_params.token1).transferFrom(msg.sender, address(this), trades[i].amount1Desired);

        IERC20Minimal(_params.token0).approve(nonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(nonfungiblePositionManager, _params.amount1Desired);

        INonfungiblePositionManager.MintParams memory params =
            INonfungiblePositionManager.MintParams({
                token0: _params.token0,
                token1: _params.token1,
                fee: _params.fee,
                tickLower: _params.tickLower,
                tickUpper: _params.tickUpper,
                amount0Desired: _params.amount0Desired,
                amount1Desired: _params.amount1Desired,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                recipient: msg.sender,
                deadline: _params.deadline
            });

        (tokenId, liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).mint(params);

        _createDeposit(msg.sender, tokenId);

        (, , token0, token1, , , , , , , , ) 
            = INonfungiblePositionManager(nonfungiblePositionManager).positions(tokenId);

        // Remove allowance and refund in both assets.
        if (amount0 < _params.amount0Desired) {
            IERC20Minimal(token0).approve(nonfungiblePositionManager, 0);
            uint256 refund0 = _params.amount0Desired - amount0;
            IERC20Minimal(token0).transfer(msg.sender, refund0);
        }

        if (amount1 < _params.amount1Desired) {
            IERC20Minimal(token1).approve(nonfungiblePositionManager, 0);
            uint256 refund1 = _params.amount1Desired - amount1;
            IERC20Minimal(token1).transfer(msg.sender, refund1);
        }
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata _params) 
        external override returns (uint256 liquidity, address token0, address token1, uint256 amount0, uint256 amount1) 
    {
        IERC20Minimal(_params.token0).transferFrom(msg.sender, address(this), _params.amount0Desired);
        IERC20Minimal(_params.token1).transferFrom(msg.sender, address(this), _params.amount1Desired);

        IERC20Minimal(_params.token0).approve(nonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(nonfungiblePositionManager, _params.amount1Desired);

        INonfungiblePositionManager.IncreaseLiquidityParams memory params =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: _params.tokenId,
                amount0Desired: _params.amount0Desired,
                amount1Desired: _params.amount1Desired,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });

        (liquidity, token0, token1, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).increaseLiquidity(params);
    }

    function collectPositionFee(CollectPositionFeeParams calldata _params) 
        external override returns (address token0, address token1, uint256 amount0, uint256 amount1) 
    {   
        INonfungiblePositionManager.CollectParams memory params =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: msg.sender,
                amount0Max: _params.amount0Max,
                amount1Max: _params.amount1Max
            });
        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).collect(params);

        (, , token0, token1, , , , , , , , ) 
            = INonfungiblePositionManager(nonfungiblePositionManager).positions(_params.tokenId);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata _params) 
        external override returns (address token0, address token1, uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == deposits[tokenId].owner, 'NA');

        INonfungiblePositionManager.DecreaseLiquidityParams memory params =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: _params.tokenId,
                liquidity: _params.liquidity,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });
        INonfungiblePositionManager(nonfungiblePositionManager).decreaseLiquidity(params);

        INonfungiblePositionManager.CollectParams memory collectParams =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: msg.sender,
                amount0Max: MAX_INT,
                amount1Max: MAX_INT
            });
        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).collect(collectParams);

        (, , token0, token1, , , , , , , , ) 
            = INonfungiblePositionManager(nonfungiblePositionManager).positions(_params.tokenId);
    }
}