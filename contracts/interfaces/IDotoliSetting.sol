// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface IDotoliSetting {
    event FactoryCreated();
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event MinPoolAmountChanged(uint256 amount);
    event ManagerFeeChanged(uint256 managerFee);
    event WhiteListTokenAdded(address indexed token);
    event WhiteListTokenRemoved(address indexed token);

    /// @notice Returns the current owner of the factory
    /// @dev Can be changed by the current owner via setOwner
    /// @return The address of the factory owner
    function owner() external view returns (address);
    function weth9() external view returns (address);
    function managerFee() external view returns (uint256);
    function minPoolAmount() external view returns (uint256);
    function whiteListTokens(address _token) external view returns (bool);

    /// @notice Updates the owner of the factory
    /// @dev Must be called by the current owner
    /// @param _owner The new owner of the factory
    function setOwner(address _owner) external;
    function setManagerFee(uint256 _managerFee) external;
    function setMinPoolAmount(uint256 volume) external;
    function setWhiteListToken(address _token) external;
    function resetWhiteListToken(address _token) external;
}