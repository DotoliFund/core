// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFactory.sol';
import './XXXFund2.sol';

import "hardhat/console.sol";

contract XXXFactory is IXXXFactory, Constants {
    address public override owner;

    uint256 managerFee = 1; // 1% of investor profit ex) MANAGER_FEE = 10 -> 10% of investor profit
    address[] whiteListTokens;

    mapping(address => address) public getFundByManager;
    mapping(address => mapping(uint256 => address)) private getFundByInvestor;
    mapping(address => uint256) private getFundCountByInvestor;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerChanged(address(0), msg.sender);

        //TODO : change testnet WETH, USDC
        whiteListTokens.push(WETH9); //WETH mainnet
        whiteListTokens.push(WBTC); //WBTC
        whiteListTokens.push(USDC); //USDC
        whiteListTokens.push(DAI); //DAI
        whiteListTokens.push(UNI); //UNI
        whiteListTokens.push(XXX); //XXX

        //console.log("msg.sender : ", msg.sender);
    }

    function createFund() external override returns (address fund) {
        require(getFundByManager[msg.sender] == address(0), 'FUND_EXISTS');
        fund = address(new XXXFund2{salt: keccak256(abi.encode(address(this), msg.sender))}());
        getFundByManager[msg.sender] = fund;
        IXXXFund2(fund).initialize(msg.sender);

        //subscribe
        uint256 fundCount = getFundCountByInvestor[msg.sender];
        getFundByInvestor[msg.sender][fundCount] = fund;
        getFundCountByInvestor[msg.sender] += 1;

        emit FundCreated(fund, msg.sender);
    }

    function setOwner(address newOwner) external override {
        require(msg.sender == owner);
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function getSwapRouterAddress() external override view returns (address) {
        return swapRouterAddress;
    }
    
    function setSwapRouterAddress(address _swapRouterAddress) external override {
        require(msg.sender == owner);
        swapRouterAddress = _swapRouterAddress;
    }

    function getManagerFee() external override view returns (uint256) {
        return managerFee;
    }

    function setManagerFee(uint256 _managerFee) external override {
        require(msg.sender == owner);
        managerFee = _managerFee;
    }

    function isWhiteListToken(address _token) public override view returns (bool) {
        for (uint256 i=0; i<whiteListTokens.length; i++) {
            if (whiteListTokens[i] == _token) {
                return true;
            }
        }
        return false;
    }

    function getWhiteListTokens() external override view returns (address[] memory) {
        uint256 _whiteListTokenCount = whiteListTokens.length;
        address[] memory _whiteListTokens = new address[](_whiteListTokenCount);
        for (uint256 i; i<_whiteListTokenCount; i++) {
            _whiteListTokens[i] = whiteListTokens[i];
        }
        return _whiteListTokens;
    }

    function addWhiteListToken(address _token) external override {
        require(msg.sender == owner);
        if (!isWhiteListToken(_token)) {
            whiteListTokens.push(_token);
        }
    }

    function removeWhiteListToken(address _token) external override {
        require(msg.sender == owner);
        for (uint256 i=0; i<whiteListTokens.length; i++) {
            if (whiteListTokens[i] == _token) {
                whiteListTokens[i] = whiteListTokens[whiteListTokens.length - 1];
                whiteListTokens.pop();
            }
        }
    }

    function isSubscribed(address investor, address fund) public override view returns (bool) {
        uint256 fundCount = getFundCountByInvestor[investor];
        for (uint256 i=0; i<fundCount; i++) {
            if (fund == getFundByInvestor[investor][i]) {
                return true;
            }
        }
        return false;
    }

    function subscribedFunds() external override view returns (address[] memory){
        uint256 fundCount = getFundCountByInvestor[msg.sender];
        address[] memory funds;
        funds = new address[](fundCount);
        for (uint256 i=0; i<fundCount; i++) {
            funds[i] = getFundByInvestor[msg.sender][i];
        }
        return funds;
    }
    
    function subscribe(address fund) external override lock {
        require(!isSubscribed(msg.sender, fund), 'AR');
        uint256 fundCount = getFundCountByInvestor[msg.sender];
        address manager = IXXXFund2(fund).manager();
        getFundByInvestor[msg.sender][fundCount] = fund;
        getFundCountByInvestor[msg.sender] += 1;
        emit Subscribe(fund, manager, msg.sender);
    }
}