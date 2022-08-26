// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import './interfaces/ISwapRouter.sol';
import './interfaces/IXXXFund.sol';
import './interfaces/IXXXFactory.sol';

contract SwapRouter is ISwapRouter {
    address public factory;

    function multicall(bytes[] calldata data) external payable override returns (bytes[] memory results) {
		address fund = IXXXFactory(factory).getFund(msg.sender);
		require(fund != address(0), 'multicall: sender is not manager');

        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);

            if (!success) {
                // Next 5 lines from https://ethereum.stackexchange.com/a/83577
                if (result.length < 68) revert();
                assembly {
                    result := add(result, 0x04)
                }
                revert(abi.decode(result, (string)));
            }

            results[i] = result;
        }
    }



    // function multicall(uint256 deadline, bytes[] calldata data) internal lock {
    //     ISwapRouter02(0xE592427A0AEce92De3Edee1F18E0157C05861564).multicall(deadline, data);
    // }

    // function multicall(bytes32 previousBlockhash, bytes[] calldata data) internal lock {
    //     router.multicall(previousBlockhash, data);
    // }

    // function selfPermitAllowed(address _swapRouterAddress, ISwapRouter02.ExactInputSingleParams calldata params) internal lock {
    //     router.selfPermitAllowed(
    //         token,
    //         nonce,
    //         expiry,
    //         v,
    //         r,
    //         s
    //     );
    // }

    // function selfPermit(address _swapRouterAddress, ISwapRouter02.ExactInputSingleParams calldata params) internal lock {
    //     router.selfPermit(
    //         token,
    //         value,
    //         deadline,
    //         v,
    //         r,
    //         s
    //     );
    // }








//////////////////////////////////////////        Uniswap V2 swap router Interface from ISwapRouter02       ////////////////////////////////////////////




    // function uniswapV2_swapExactTokensForTokens(
    //     uint256 amountIn,
    //     uint256 amountOutMin,
    //     address[] calldata path,
    //     address to
    // ) external payable override returns (uint256 amountOut) {
    //     require(msg.sender == manager, "Not manager");
    //     //require(IXXXFactory(factory).isWhiteListToken(_params.tokenOut), 'XXXFund swapExactInputSingle: not whitelist token');
    //     // msg.sender must approve this contract
    //     address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();




    //     //updateSwapInfo(manager, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    //     //emit Swap(manager, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    // }

    // function uniswapV2_swapTokensForExactTokens(
    //     uint256 amountOut,
    //     uint256 amountInMax,
    //     address[] calldata path,
    //     address to
    // ) external payable override returns (uint256 amountIn) {
    //     require(msg.sender == manager, "Not manager");
    //     //require(IXXXFactory(factory).isWhiteListToken(_params.tokenOut), 'XXXFund swapExactInputSingle: not whitelist token');
    //     // msg.sender must approve this contract
    //     address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();





        //updateSwapInfo(manager, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
        //emit Swap(manager, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    //}





//////////////////////////////////////////        Uniswap V3 swap router Interface from ISwapRouter02       ////////////////////////////////////////////




    // function uniswapV3_exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata _params) override external lock returns (uint256 amountOut) {
    //     require(msg.sender == manager, "Not manager");
    //     require(IXXXFactory(factory).isWhiteListToken(_params.tokenOut), 'XXXFund swapExactInputSingle: not whitelist token');
    //     // msg.sender must approve this contract
    //     address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

    //     // msg.sender must approve this contract
    //     // Approve the router to spend tokenIn.
    //     _params.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, _params.amountIn));

    //     // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
    //     // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
    //     ISwapRouter02.ExactInputSingleParams memory params =
    //         IV3SwapRouter.ExactInputSingleParams({
    //             tokenIn: _params.tokenIn,
    //             tokenOut: _params.tokenOut,
    //             fee: _params.fee,
    //             recipient: msg.sender,
    //             //deadline: _params.deadline,
    //             amountIn: _params.amountIn,
    //             amountOutMinimum: 0,
    //             sqrtPriceLimitX96: 0
    //         });

    //     // The call to `exactInputSingle` executes the swap.
    //     amountOut = ISwapRouter02(_swapRouterAddress).exactInputSingle(params);

    //     updateSwapInfo(manager, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    //     emit Swap(manager, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    // }

    // function uniswapV3_exactOutputSingle(ISwapRouter02.ExactOutputSingleParams calldata _params) override external lock returns (uint256 amountIn) {
    //     require(msg.sender == manager, "Not manager");
    //     require(IXXXFactory(factory).isWhiteListToken(_params.tokenOut), 'XXXFund swapExactOutputSingle: not whitelist token');
    //     address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

    //     // Approve the router to spend the specifed `amountInMaximum` of tokenIn.
    //     // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
    //     _params.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, _params.amountInMaximum));

    //     ISwapRouter02.ExactOutputSingleParams memory params =
    //         IV3SwapRouter.ExactOutputSingleParams({
    //             tokenIn: _params.tokenIn,
    //             tokenOut: _params.tokenOut,
    //             fee: _params.fee,
    //             recipient: msg.sender,
    //             //deadline: _params.deadline,
    //             amountOut: _params.amountOut,
    //             amountInMaximum: _params.amountInMaximum,
    //             sqrtPriceLimitX96: 0
    //         });

    //     // Executes the swap returning the amountIn needed to spend to receive the desired amountOut.
    //     amountIn = ISwapRouter02(_swapRouterAddress).exactOutputSingle(params);

    //     // For exact output swaps, the amountInMaximum may not have all been spent.
    //     // If the actual amount spent (amountIn) is less than the specified maximum amount, we must refund the msg.sender and approve the swapRouter to spend 0.
    //     if (amountIn < _params.amountInMaximum) {
    //         _params.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, 0));
    //         _params.tokenIn.call(abi.encodeWithSelector(IERC20.transfer.selector, msg.sender, _params.amountInMaximum - amountIn));
    //     }

    //     updateSwapInfo(manager, _params.tokenIn, _params.tokenOut, amountIn, _params.amountOut);
    //     emit Swap(manager, _params.tokenIn, _params.tokenOut, amountIn, _params.amountOut);
    // }

    // function uniswapV3_exactInputMultihop(ISwapRouter02.ExactInputParams calldata _params) override external lock returns (uint256 amountOut) {
    //     require(msg.sender == manager, "Not manager");
    //     address tokenOut = getTokenOutFromPath(_params.path);
    //     require(IXXXFactory(factory).isWhiteListToken(tokenOut), 'XXXFund swapExactInputMultihop: not whitelist token');

    //     address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

    //     // Approve the router to spend DAI.
    //     DAI.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, _params.amountIn));

    //     // Multiple pool swaps are encoded through bytes called a `path`. A path is a sequence of token addresses and poolFees that define the pools used in the swaps.
    //     // The format for pool encoding is (tokenIn, fee, tokenOut/tokenIn, fee, tokenOut) where tokenIn/tokenOut parameter is the shared token across the pools.
    //     // Since we are swapping DAI to USDC and then USDC to WETH9 the path encoding is (DAI, 0.3%, USDC, 0.3%, WETH9).
    //     ISwapRouter02.ExactInputParams memory params =
    //         IV3SwapRouter.ExactInputParams({
    //             path: _params.path, //abi.encodePacked(DAI, poolFee, USDC, poolFee, WETH9),
    //             recipient: address(this),
    //             //deadline: _params.deadline,
    //             amountIn: _params.amountIn,
    //             amountOutMinimum: 0
    //         });

    //     // Executes the swap.
    //     amountOut = ISwapRouter02(_swapRouterAddress).exactInput(params);

    //     updateSwapInfo(manager, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    //     emit Swap(manager, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    // }

    // function uniswapV3_exactOutputMultihop(ISwapRouter02.ExactOutputParams calldata _params) override external lock returns (uint256 amountIn) {
    //     require(msg.sender == manager, "Not manager");
    //     address tokenOut = getTokenOutFromPath(_params.path);
    //     require(IXXXFactory(factory).isWhiteListToken(tokenOut), 'XXXFund swapExactOutputMultihop: not whitelist token');

    //     address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

    //     // Approve the router to spend  `amountInMaximum`.
    //     DAI.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, _params.amountInMaximum));

    //     // The parameter path is encoded as (tokenOut, fee, tokenIn/tokenOut, fee, tokenIn)
    //     // The tokenIn/tokenOut field is the shared token between the two pools used in the multiple pool swap. In this case USDC is the "shared" token.
    //     // For an exactOutput swap, the first swap that occurs is the swap which returns the eventual desired token.
    //     // In this case, our desired output token is WETH9 so that swap happpens first, and is encoded in the path accordingly.
    //     ISwapRouter02.ExactOutputParams memory params =
    //         IV3SwapRouter.ExactOutputParams({
    //             path: _params.path, //abi.encodePacked(WETH9, poolFee, USDC, poolFee, DAI),
    //             recipient: address(this),
    //             //deadline: block.timestamp,
    //             amountOut: _params.amountOut,
    //             amountInMaximum: _params.amountInMaximum
    //         });

    //     // Executes the swap, returning the amountIn actually spent.
    //     amountIn = ISwapRouter02(_swapRouterAddress).exactOutput(params);

    //     // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we refund msg.sender and approve the router to spend 0.
    //     if (amountIn < _params.amountInMaximum) {
    //         DAI.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, 0)); 
    //         DAI.call(abi.encodeWithSelector(IERC20.transferFrom.selector, address(this), msg.sender, _params.amountInMaximum - amountIn));
    //     }

    //     updateSwapInfo(manager, _params.tokenIn, _params.tokenOut, amountIn, _params.amountOut);
    //     emit Swap(manager, _params.tokenIn, _params.tokenOut, amountIn, _params.amountOut);
    // }



}