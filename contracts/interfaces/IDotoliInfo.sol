// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

interface IDotoliFund {
    event FundCreated(uint256 fundId, address indexed manager);
    event Subscribe(uint256 fundId, address indexed investor);
    
    function isSubscribed(address investor, uint256 fundId) external view returns (bool);
    function subscribedFunds(address investor) external view returns (uint256[] memory);
    function subscribe(uint256 fundId) external;

    function getFundTokens(uint256 fundId) external view returns (Token[] memory);
    function getInvestorTokens(uint256 fundId, address investor) external view returns (Token[] memory);
    function getFeeTokens(uint256 fundId) external view returns (Token[] memory);
    function getFundTokenAmount(uint256 fundId, address token) external view returns (uint256);
    function getInvestorTokenAmount(uint256 fundId, address investor, address token) external view returns (uint256);
    function getTokenIds(uint256 fundId, address investor) external view returns (uint256[] memory);
}