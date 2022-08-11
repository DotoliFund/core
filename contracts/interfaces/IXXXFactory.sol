// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.4;

interface IXXXFactory {

    /// @notice Returns the current owner of the factory
    /// @dev Can be changed by the current owner via setOwner
    /// @return The address of the factory owner
    function owner() external view returns (address);

    /// @notice Updates the owner of the factory
    /// @dev Must be called by the current owner
    /// @param _owner The new owner of the factory
    function setOwner(address _owner) external;

    function createFund(address manager, address token, uint256 amount) external returns (address fund);
}