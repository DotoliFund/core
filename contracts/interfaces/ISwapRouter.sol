// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

/// @title Multicall interface
/// @notice Enables calling multiple methods in a single call to the contract
interface ISwapRouter {


    // /**
    //  * Trade for producing the arguments to send calls to the router.
    //  */
    struct Trade {
        string tradeType;
        address input;
        address output;
        uint256 inputAmount;
        uint256 outputAmount;
    }

    // /**
    //  * SwapOptions for producing the arguments to send calls to the router.
    //  */
    struct SwapOptions {
        uint256 slippageTolerance;
        address recipient;
        uint256 deadlineOrPreviousBlockhash;
        uint256 inputTokenPermit;
        uint256 fee;
    }

    function swapRouter(
        address invester,
        Trade[] calldata trades,
        SwapOptions calldata options
    ) external payable returns (uint256);
}