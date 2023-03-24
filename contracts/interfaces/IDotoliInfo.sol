// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './IToken.sol';

interface IDotoliInfo is IToken {
    event InfoCreated();
    event OwnerChanged(address owner, address newOwner);
    event FundCreated(uint256 fundId, address indexed manager);
    event Subscribe(uint256 fundId, address indexed investor);
    
    function owner() external view returns (address _owner);
    function manager(uint256 fundId) external view returns (address _manager);
    function managingFund(address _manager) external view returns (uint256 fundId);
    function tokenIdOwner(uint256 tokenId) external view returns (address _owner);
    function fundIdCount() external view returns (uint256 fundCount);

    function setOwner(address newOwner) external;
    function createFund() external returns (uint256 fundId);
    function isSubscribed(address investor, uint256 fundId) external view returns (bool);
    function subscribedFunds(address investor) external view returns (uint256[] memory);
    function subscribe(uint256 fundId) external;

    function getFundTokens(uint256 fundId) external view returns (Token[] memory);
    function getInvestorTokens(uint256 fundId, address investor) external view returns (Token[] memory);
    function getFeeTokens(uint256 fundId) external view returns (Token[] memory);
    function getFundTokenAmount(uint256 fundId, address token) external view returns (uint256);
    function getInvestorTokenAmount(uint256 fundId, address investor, address token) external view returns (uint256);
    function getTokenIds(uint256 fundId, address investor) external view returns (uint256[] memory);

    function addTokenId(uint256 fundId, address investor, uint256 tokenId) external;
    function increaseFundToken(uint256 fundId, address token, uint256 amount) external;
    function decreaseFundToken(uint256 fundId, address token, uint256 amount) external returns (bool);
    function increaseInvestorToken(uint256 fundId, address investor, address token, uint256 amount) external;
    function decreaseInvestorToken(uint256 fundId, address investor, address token, uint256 amount) external returns (bool);
    function increaseFeeToken(uint256 fundId, address token, uint256 amount) external;
    function decreaseFeeToken(uint256 fundId, address token, uint256 amount) external returns (bool);
}