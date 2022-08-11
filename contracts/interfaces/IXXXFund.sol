// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

interface IXXXFund {

    struct Token {
        address tokenAddress;
        uint256 amount;
    }

    struct ReservedTokenHistory {
    	string date;
        address tokenAddress;
        uint256 amount;
    }

    struct ManagerHistory {
        string date;
        uint256 fundPrincipalUSD;
        uint256 totalValueUSD;
        uint256 totalValueETH;
        uint256 profitRate;
    }

    function initialize(address _manager, address _token, uint256 _amount) external;
    
    function deposit(address sender, address _token, uint256 _amount) external;
    function withdraw(address _token, address to, uint256 _amount) external;

    function swapExactInputSingle(ISwapRouter.ExactInputSingleParams calldata _params, address investor) external returns (uint256 amountOut);
    function swapExactOutputSingle(ISwapRouter.ExactOutputSingleParams calldata _params, address investor) external returns (uint256 amountIn);
    //function swapExactInputMultihop(address _token, address to, uint256 _amount) external;
    //function swapExactOutputMultihop(address _token, address to, uint256 _amount) external;

    function addReservedTokenHistory() external;
    function getReservedTokenHistory() external returns (ReservedTokenHistory[] calldata);
    function addManagerHistory() external;
    function getManagerHistory() external returns (ManagerHistory[] calldata);
}