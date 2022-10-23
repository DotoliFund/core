// SPDX-License-Identifier: MIT
// Inspired by https://github.com/smartcontractkit/defi-minimal
pragma solidity =0.8.4;

interface IXXXStaking {

    function rewardPerToken() external view returns (uint256);
    function earned(address account) external view returns (uint256);
    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claimReward() external;
}