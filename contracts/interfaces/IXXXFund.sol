// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

interface IXXXFund {
    function initialize(address _manager, address _token, uint256 _amount) external;
    
    function deposit(address sender, address _token, uint256 _amount) external;
    function withdraw(address _token, address to, uint256 _amount) external;
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;
}