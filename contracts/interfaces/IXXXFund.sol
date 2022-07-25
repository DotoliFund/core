// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.9;

interface IXXXFund {
    event Deposit(address indexed sender, uint amount0, uint amount1);
    event Withdraw(address indexed sender, uint amount0, uint amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    function factory() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function History() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
  
    function deposit(address to) external returns (uint liquidity);
    function withdraw(address to) external returns (uint amount0, uint amount1);
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;

    function initialize(address, address) external;
}