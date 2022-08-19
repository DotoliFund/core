// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.8.4;

interface IXXXFactory {

    event Create(address fund, address manager);

    /// @notice Returns the current owner of the factory
    /// @dev Can be changed by the current owner via setOwner
    /// @return The address of the factory owner
    function owner() external view returns (address);

    function createFund(address manager) external returns (address fund);
    
    /// @notice Updates the owner of the factory
    /// @dev Must be called by the current owner
    /// @param _owner The new owner of the factory
    function setOwner(address _owner) external;

    function getSwapRouterAddress() external returns (address);

    function setSwapRouterAddress(address _swapRouterAddress) external;

    function getManagerFee() external returns (uint256);

    function setManagerFee(uint256 _managerFee) external;

    function isWhiteListToken(address _token) external returns (bool);

    function getWhiteListTokens() external returns (address[] memory);

    function addWhiteListToken(address _token) external;

    function removeWhiteListToken(address _token) external;
}