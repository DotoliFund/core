// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './base/Token.sol';
import './interfaces/IDotoliInfo.sol';

contract DotoliInfo is Token, IDotoliInfo {
    
    address public dotoliFund;

    mapping(address => uint256) public managingFund;                        // managingFund[manager]
    mapping(address => mapping(uint256 => uint256)) public investingFunds;  // investingFunds[investor]
    mapping(address => uint256) public investingFundCount;

    mapping(uint256 => address) public manager;                             // manager[fundId]
    mapping(uint256 => Token[]) public fundTokens;                          // fundTokens[fundId]
    mapping(uint256 => Token[]) public feeTokens;                           // feeTokens[fundId]
    mapping(uint256 => mapping(address => Token[])) public investorTokens;  // investorTokens[fundId][investor]
    mapping(uint256 => mapping(address => uint256[])) public tokenIds;      // tokenIds[fundId][investor]
    mapping(uint256 => address) public tokenIdOwner;                        // tokenIdOwner[tokenId] => owner of uniswap v3 liquidity position
    mapping(uint256 => uint256) public investorCount;                       // investorCount[fundId]

    uint256 public fundIdCount = 0;

    modifier onlyOwner() {
        require(msg.sender == dotoliFund, 'NA');
        _;
    }

    constructor(address _factory, address _weth9, address _swapRouter, address _liquidityRouter) {
        dotoliFund = msg.sender;
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

    function getTokenAmount(Token[] memory tokens, address token) private view returns (uint256) {
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].tokenAddress == token) {
                return tokens[i].amount;
            }
        }
        return 0;
    }

    function getFundTokenAmount(uint256 fundId, address token) public override view returns (uint256) {
        return getTokenAmount(fundTokens[fundId], token);
    }

    function getInvestorTokenAmount(uint256 fundId, address investor, address token) public override view returns (uint256) {
        return getTokenAmount(investorTokens[fundId][investor], token);
    }

    function getTokenIds(uint256 fundId, address investor) external override view returns (uint256[] memory _tokenIds) {
        _tokenIds = tokenIds[fundId][investor];
    }

    function createFund() external override returns (uint256 fundId) {
        require(managingFund[msg.sender] == 0, 'EXISTS');
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

    function increaseFundToken(uint256 fundId, address token, uint256 amount) onlyOwner external override {
        increaseToken(fundTokens[fundId], token, amount);
    }

    function decreaseFundToken(uint256 fundId, address token, uint256 amount) onlyOwner external override returns (bool) {
        decreaseToken(fundTokens[fundId], token, amount);
    }

    function increaseInvestorToken(uint256 fundId, address investor, address token, uint256 amount) onlyOwner external override {
        increaseToken(investorTokens[fundId][investor], token, amount);
    }

    function decreaseInvestorToken(uint256 fundId, address investor, address token, uint256 amount) onlyOwner external override returns (bool) {
        decreaseToken(investorTokens[fundId][investor], token, amount);
    }

    function increaseFeeToken(uint256 fundId, address token, uint256 amount) onlyOwner external override {
        increaseToken(feeTokens[fundId], token, amount);
    }

    function decreaseFeeToken(uint256 fundId, address token, uint256 amount) onlyOwner external override returns (bool) {
        decreaseToken(feeTokens[fundId], token, amount);
    }

}