// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.9;

interface IXXXFactory {
    event FundCreated(address indexed manager, address fund, uint);

    /// @notice Emitted when the owner of the factory is changed
    /// @param oldOwner The owner before the owner was changed
    /// @param newOwner The owner after the owner was changed
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    /// @notice Returns the current owner of the factory
    /// @dev Can be changed by the current owner via setOwner
    /// @return The address of the factory owner
    function owner() external view returns (address);

    function getFund(address manager) external view returns (address fund);
    function totalFunds() external view returns (uint);

    /// @notice Updates the owner of the factory
    /// @dev Must be called by the current owner
    /// @param _owner The new owner of the factory
    function setOwner(address _owner) external;

    function createFund(address manager) external returns (address fund);
}