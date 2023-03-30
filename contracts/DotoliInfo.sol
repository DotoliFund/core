// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './base/Token.sol';
import './interfaces/IDotoliInfo.sol';

//TODO : remove console log
import "hardhat/console.sol";

contract DotoliInfo is Token, IDotoliInfo {
    
    address public override owner;

    mapping(uint256 => address) public override manager;                    // manager[fundId]
    mapping(uint256 => uint256) public investorCount;                       // investorCount[fundId]
    uint256 public override fundIdCount = 0;

    // fundId
    mapping(address => uint256) public override managingFund;               // managingFund[manager]
    mapping(address => mapping(uint256 => uint256)) public investingFunds;  // investingFunds[investor]
    mapping(address => uint256) public investingFundCount;

    // Token
    mapping(uint256 => Token[]) public fundTokens;                          // fundTokens[fundId]
    mapping(uint256 => Token[]) public feeTokens;                           // feeTokens[fundId]
    mapping(uint256 => mapping(address => Token[])) public investorTokens;  // investorTokens[fundId][investor]

    // uniswap v3 liquidity pool tokenId
    mapping(uint256 => mapping(address => uint256[])) public tokenIds;      // tokenIds[fundId][investor]
    mapping(uint256 => address) public override tokenIdOwner;               // tokenIdOwner[tokenId] => owner of uniswap v3 liquidity position

    modifier onlyOwner() {
        require(msg.sender == owner, 'NO');
        _;
    }

    constructor() {
        owner = msg.sender;
        emit InfoCreated();
    }

    function setOwner(address newOwner) external override onlyOwner {
        owner = newOwner;
        emit OwnerChanged(owner, newOwner);
    }

    function getFundTokens(uint256 fundId) external override view returns (Token[] memory) {
        return fundTokens[fundId];
    }

    function getInvestorTokens(uint256 fundId, address investor) external override view returns (Token[] memory) {
        return investorTokens[fundId][investor];
    }

    function getFeeTokens(uint256 fundId) external override view returns (Token[] memory) {
        return feeTokens[fundId];
    }

    function getFundTokenAmount(uint256 fundId, address token) public override view returns (uint256) {
        Token[] memory tokens = fundTokens[fundId];
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].token == token) {
                return tokens[i].amount;
            }
        }
        return 0;
    }

    function getInvestorTokenAmount(uint256 fundId, address investor, address token) public override view returns (uint256) {
        Token[] memory tokens = investorTokens[fundId][investor];
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].token == token) {
                return tokens[i].amount;
            }
        }
        return 0;
    }

    function getTokenIds(uint256 fundId, address investor) external override view returns (uint256[] memory _tokenIds) {
        _tokenIds = tokenIds[fundId][investor];
    }

    function createFund() external override returns (uint256 fundId) {
        require(managingFund[msg.sender] == 0, 'EXIST');
        fundId = ++fundIdCount;
        managingFund[msg.sender] = fundId;
        uint256 fundCount = investingFundCount[msg.sender];
        investingFunds[msg.sender][fundCount] = fundId;
        investingFundCount[msg.sender] += 1;
        manager[fundId] = msg.sender;
        emit FundCreated(fundId, msg.sender);
    }

    function isSubscribed(address investor, uint256 fundId) public override view returns (bool) {
        uint256 fundCount = investingFundCount[investor];
        for (uint256 i=0; i<fundCount; i++) {
            if (fundId == investingFunds[investor][i]) {
                return true;
            }
        }
        return false;
    }

    function subscribedFunds(address investor) external override view returns (uint256[] memory){
        uint256 fundCount = investingFundCount[investor];
        uint256[] memory fundIds;
        fundIds = new uint256[](fundCount);
        for (uint256 i=0; i<fundCount; i++) {
            fundIds[i] = investingFunds[investor][i];
        }
        return fundIds;
    }

    function subscribe(uint256 fundId) external override {
        require(!isSubscribed(msg.sender, fundId), 'EXIST');
        uint256 fundCount = investingFundCount[msg.sender];
        investingFunds[msg.sender][fundCount] = fundId;
        investingFundCount[msg.sender] += 1;
        investorCount[fundId] += 1;
        emit Subscribe(fundId, msg.sender);
    }

    function addTokenId(uint256 fundId, address investor, uint256 tokenId) external override onlyOwner {
        tokenIds[fundId][investor].push(tokenId);
        tokenIdOwner[tokenId] = investor;
    }

    function increaseFundToken(uint256 fundId, address token, uint256 amount) external override onlyOwner {
        increaseToken(fundTokens[fundId], token, amount);
    }

    function decreaseFundToken(uint256 fundId, address token, uint256 amount) external override onlyOwner returns (bool) {
        return decreaseToken(fundTokens[fundId], token, amount);
    }

    function increaseInvestorToken(uint256 fundId, address investor, address token, uint256 amount) external override onlyOwner {
        increaseToken(investorTokens[fundId][investor], token, amount);
    }

    function decreaseInvestorToken(uint256 fundId, address investor, address token, uint256 amount) external override onlyOwner returns (bool) {
        return decreaseToken(investorTokens[fundId][investor], token, amount);
    }

    function increaseFeeToken(uint256 fundId, address token, uint256 amount) external override onlyOwner {
        increaseToken(feeTokens[fundId], token, amount);
    }

    function decreaseFeeToken(uint256 fundId, address token, uint256 amount) external override onlyOwner returns (bool) {
        return decreaseToken(feeTokens[fundId], token, amount);
    }

}