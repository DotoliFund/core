// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '../interfaces/IERC20.sol';

library SwapRouter {

    function V3ExactInputSingle(ISwapRouter.ExactInputSingleParams calldata _params, address _swapRouterAddress) internal returns (uint256 amountOut) {
        // msg.sender must approve this contract

        // Approve the router to spend tokenIn.
        _params.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, _params.amountIn));

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: _params.tokenIn,
                tokenOut: _params.tokenOut,
                fee: _params.fee,
                recipient: msg.sender,
                deadline: _params.deadline,
                amountIn: _params.amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to `exactInputSingle` executes the swap.
        amountOut = ISwapRouter(_swapRouterAddress).exactInputSingle(params);
    }

    function V3ExactOutputSingle(ISwapRouter.ExactOutputSingleParams calldata _params, address _swapRouterAddress) internal returns (uint256 amountIn) {
        // Approve the router to spend the specifed `amountInMaximum` of tokenIn.
        // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
        _params.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, _params.amountInMaximum));

        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: _params.tokenIn,
                tokenOut: _params.tokenOut,
                fee: _params.fee,
                recipient: msg.sender,
                deadline: _params.deadline,
                amountOut: _params.amountOut,
                amountInMaximum: _params.amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        // Executes the swap returning the amountIn needed to spend to receive the desired amountOut.
        amountIn = ISwapRouter(_swapRouterAddress).exactOutputSingle(params);

        // For exact output swaps, the amountInMaximum may not have all been spent.
        // If the actual amount spent (amountIn) is less than the specified maximum amount, we must refund the msg.sender and approve the swapRouter to spend 0.
        if (amountIn < _params.amountInMaximum) {
            _params.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, 0));
            _params.tokenIn.call(abi.encodeWithSelector(IERC20.transfer.selector, msg.sender, _params.amountInMaximum - amountIn));
        }
    }

    // function V3ExactInputMultihop(ISwapRouter.ExactInputParams calldata _params, address _swapRouterAddress) internal returns (uint256 amountOut) {
    //     // Approve the router to spend DAI.
    //     DAI.call(abi.encodeWithSelector(IERC20.approve.selector, _uniswapRouterAddress, _params.amountIn));

    //     // Multiple pool swaps are encoded through bytes called a `path`. A path is a sequence of token addresses and poolFees that define the pools used in the swaps.
    //     // The format for pool encoding is (tokenIn, fee, tokenOut/tokenIn, fee, tokenOut) where tokenIn/tokenOut parameter is the shared token across the pools.
    //     // Since we are swapping DAI to USDC and then USDC to WETH9 the path encoding is (DAI, 0.3%, USDC, 0.3%, WETH9).
    //     ISwapRouter.ExactInputParams memory params =
    //         ISwapRouter.ExactInputParams({
    //             path: _params.path, //abi.encodePacked(DAI, poolFee, USDC, poolFee, WETH9),
    //             recipient: msg.sender,
    //             deadline: _params.deadline,
    //             amountIn: _params.amountIn,
    //             amountOutMinimum: 0
    //         });

    //     // Executes the swap.
    //     amountOut = ISwapRouter(_uniswapRouterAddress).exactInput(params);
    // }

    // function V3ExactOutputMultihop(ISwapRouter.ExactOutputParams calldata _params, address _swapRouterAddress) internal returns (uint256 amountIn) {
    //     // Approve the router to spend  `amountInMaximum`.
    //     DAI.call(abi.encodeWithSelector(IERC20.approve.selector, _uniswapRouterAddress, _params.amountInMaximum));

    //     // The parameter path is encoded as (tokenOut, fee, tokenIn/tokenOut, fee, tokenIn)
    //     // The tokenIn/tokenOut field is the shared token between the two pools used in the multiple pool swap. In this case USDC is the "shared" token.
    //     // For an exactOutput swap, the first swap that occurs is the swap which returns the eventual desired token.
    //     // In this case, our desired output token is WETH9 so that swap happpens first, and is encoded in the path accordingly.
    //     ISwapRouter.ExactOutputParams memory params =
    //         ISwapRouter.ExactOutputParams({
    //             path: _params.path, //abi.encodePacked(WETH9, poolFee, USDC, poolFee, DAI),
    //             recipient: msg.sender,
    //             deadline: block.timestamp,
    //             amountOut: _params.amountOut,
    //             amountInMaximum: _params.amountInMaximum
    //         });

    //     // Executes the swap, returning the amountIn actually spent.
    //     amountIn = ISwapRouter(_uniswapRouterAddress).exactOutput(params);

    //     // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we refund msg.sender and approve the router to spend 0.
    //     if (amountIn < _params.amountInMaximum) {
    //         DAI.call(abi.encodeWithSelector(IERC20.approve.selector, _uniswapRouterAddress, 0)); 
    //         DAI.call(abi.encodeWithSelector(IERC20.transferFrom.selector, address(this), msg.sender, _params.amountInMaximum - amountIn));
    //     }
    // }
}