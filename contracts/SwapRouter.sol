// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/ISwapRouter.sol';


contract SwapRouter is ISwapRouter {
    using Path for bytes;

    address public uniswapV3SwapRouter = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {

    }

    function getLastTokenFromPath(bytes memory path) public view override returns (address) {
        address _tokenOut;

        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
                _tokenOut = tokenOut;
                break;
            }
        }
        return _tokenOut;
    }

    function exactInputSingle(SwapParams calldata trade) private returns (uint256) {
        IERC20Minimal(trade.tokenIn).transferFrom(msg.sender, address(this), trade.amountIn);
        IERC20Minimal(trade.tokenIn).approve(uniswapV3SwapRouter, trade.amountIn);

        ISwapRouter02.ExactInputSingleParams memory params =
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: trade.tokenIn,
                tokenOut: trade.tokenOut,
                fee: trade.fee,
                recipient: msg.sender,
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum,
                sqrtPriceLimitX96: 0
            });

        uint256 amountOut = ISwapRouter02(uniswapV3SwapRouter).exactInputSingle(params);
        return amountOut;
    }

    function exactInput(SwapParams calldata trade) private returns (uint256) {
        (address tokenIn, , ) = trade.path.decodeFirstPool();
        IERC20Minimal(tokenIn).transferFrom(msg.sender, address(this), trade.amountIn);
        IERC20Minimal(tokenIn).approve(uniswapV3SwapRouter, trade.amountIn);

        ISwapRouter02.ExactInputParams memory params =
            IV3SwapRouter.ExactInputParams({
                path: trade.path,
                recipient: msg.sender,
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum
            });

        uint256 amountOut = ISwapRouter02(uniswapV3SwapRouter).exactInput(params);
        return amountOut;
    }

    function exactOutputSingle(SwapParams calldata trade) private returns (uint256) {
        IERC20Minimal(trade.tokenIn).transferFrom(msg.sender, address(this), trade.amountInMaximum);
        IERC20Minimal(trade.tokenIn).approve(uniswapV3SwapRouter, trade.amountInMaximum);

        ISwapRouter02.ExactOutputSingleParams memory params =
            IV3SwapRouter.ExactOutputSingleParams({
                tokenIn: trade.tokenIn,
                tokenOut: trade.tokenOut,
                fee: trade.fee,
                recipient: msg.sender,
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        uint256 amountIn = ISwapRouter02(uniswapV3SwapRouter).exactOutputSingle(params);
        if (amountIn < trade.amountInMaximum) {
            IERC20Minimal(trade.tokenIn).approve(uniswapV3SwapRouter, 0);
            IERC20Minimal(trade.tokenIn).transfer(msg.sender, trade.amountInMaximum - amountIn);
        }
        return amountIn;
    }

    function exactOutput(SwapParams calldata trade) private returns (uint256) {
        address tokenIn = getLastTokenFromPath(trade.path);
        IERC20Minimal(tokenIn).transferFrom(msg.sender, address(this), trade.amountInMaximum);
        IERC20Minimal(tokenIn).approve(uniswapV3SwapRouter, trade.amountInMaximum);

        ISwapRouter02.ExactOutputParams memory params =
            IV3SwapRouter.ExactOutputParams({
                path: trade.path,
                recipient: msg.sender,
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum
            });

        uint256 amountIn = ISwapRouter02(uniswapV3SwapRouter).exactOutput(params);
        if (amountIn < trade.amountInMaximum) {
            IERC20Minimal(tokenIn).approve(uniswapV3SwapRouter, 0);
            IERC20Minimal(tokenIn).transferFrom(address(this), msg.sender, trade.amountInMaximum - amountIn);
        }
        return amountIn;
    }

    function swapRouter(SwapParams calldata trade) external override lock returns (uint256) {
        if (trade.swapType == SwapType.EXACT_INPUT_SINGLE_HOP) {
            return exactInputSingle(trade);
        } else if (trade.swapType == SwapType.EXACT_INPUT_MULTI_HOP) {
            return exactInput(trade);
        } else if (trade.swapType == SwapType.EXACT_OUTPUT_SINGLE_HOP) {
            return exactOutputSingle(trade);
        } else if (trade.swapType == SwapType.EXACT_OUTPUT_MULTI_HOP) {
            return exactOutput(trade);
        }
    }
}