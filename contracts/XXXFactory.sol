// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFactory.sol';
import './XXXFund.sol';

import "hardhat/console.sol";

contract XXXFactory is IXXXFactory {
    address public override owner;
    // Uniswap v3 swapRouter
    address swapRouterAddress = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    uint256 managerFee = 1; // 1% of investor profit ex) MANAGER_FEE = 10 -> 10% of investor profit
    address[] whiteListTokens;

    mapping(address => address) override public getFundByManager;
    mapping(address => mapping(uint256 => address)) public _getFundByInvestor;
    mapping(address => uint256) public _getFundCountByInvestor;

    uint256 totalFundCount;

    constructor() {
        owner = msg.sender;
        totalFundCount = 0;
        emit OwnerChanged(address(0), msg.sender);

        whiteListTokens.push(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2); //WETH mainnet
        whiteListTokens.push(0xc778417E063141139Fce010982780140Aa0cD5Ab); //WETH9 rinkeby testnet
        whiteListTokens.push(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599); //WBTC
        whiteListTokens.push(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48); //USDC
        whiteListTokens.push(0x6B175474E89094C44Da98b954EedeAC495271d0F); //DAI
        whiteListTokens.push(0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984); //UNI
        whiteListTokens.push(0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f); //XXX

        //console.log("msg.sender : ", msg.sender);
    }

    function createFund(address manager) override external returns (address fund) {
        require(msg.sender == manager, 'XXXFactory: IDENTICAL_ADDRESSES');
        require(getFundByManager[manager] == address(0), 'XXXFactory: FUND_EXISTS');

        fund = address(new XXXFund{salt: keccak256(abi.encode(address(this), manager))}());
        getFundByManager[manager] = fund;
        IXXXFund(fund).initialize(manager);
        totalFundCount += 1;

        console.log("createFund() => fund address : ", fund);
        return fund;
    }

    function isInvestorFundList(address investor) override external returns (bool) {

    }

    function getInvestorFundList(address investor) override external returns (address[] memory){
        uint256 fundCount = _getFundCountByInvestor[investor];
        address[] memory funds;
        funds = new address[](fundCount);
        for (uint256 i=0; i<fundCount; i++) {
            funds[i] = _getFundByInvestor[investor][i];
        }
        return funds;
    }

    function addInvestorFundList(address investor) override external {

    }

    function removeInvestorFundList(address investor) override external {

    }

    function setOwner(address _owner) override external {
        require(msg.sender == owner);
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }

    function getSwapRouterAddress() override external returns (address) {
        return swapRouterAddress;
    }

    function setSwapRouterAddress(address _swapRouterAddress) override external {
        require(msg.sender == owner);
        swapRouterAddress = _swapRouterAddress;
    }

    function getManagerFee() override external returns (uint256) {
        return managerFee;
    }

    function setManagerFee(uint256 _managerFee) override external {
        require(msg.sender == owner);
        managerFee = _managerFee;
    }

    function isWhiteListToken(address _token) override public returns (bool) {
        for (uint256 i=0; i<whiteListTokens.length; i++) {
            if (whiteListTokens[i] == _token) {
                return true;
            }
        }
        return false;
    }

    function getWhiteListTokens() override public returns (address[] memory) {
        uint256 _whiteListTokenCount = whiteListTokens.length;
        address[] memory _whiteListTokens = new address[](_whiteListTokenCount);
        for (uint256 i; i<_whiteListTokenCount; i++) {
            _whiteListTokens[i] = whiteListTokens[i];
        }
        return _whiteListTokens;
    }

    function addWhiteListToken(address _token) override public {
        require(msg.sender == owner);
        if (!isWhiteListToken(_token)) {
            whiteListTokens.push(_token);
        }
    }

    function removeWhiteListToken(address _token) override public {
        require(msg.sender == owner);
        for (uint256 i=0; i<whiteListTokens.length; i++) {
            if (whiteListTokens[i] == _token) {
                whiteListTokens[i] = whiteListTokens[whiteListTokens.length - 1];
                whiteListTokens.pop();
            }
        }
    }
}