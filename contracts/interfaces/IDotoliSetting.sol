// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface IDotoliSetting {
    event SettingCreated();
    event OwnerChanged(address oldOwner, address newOwner);
    event MinPoolAmountChanged(uint256 amount);
    event ManagerFeeChanged(uint256 managerFee);
    event WhiteListTokenAdded(address indexed token);
    event WhiteListTokenRemoved(address indexed token);

    function owner() external view returns (address);
    function weth9() external view returns (address);
    function managerFee() external view returns (uint256);
    function minPoolAmount() external view returns (uint256);
    function whiteListTokens(address _token) external view returns (bool);

    function setOwner(address _owner) external;
    function setManagerFee(uint256 _managerFee) external;
    function setMinPoolAmount(uint256 volume) external;
    function setWhiteListToken(address _token) external;
    function resetWhiteListToken(address _token) external;
}