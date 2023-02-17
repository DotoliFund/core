// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IDotoliFactory.sol';
import './interfaces/IUniswapV3Oracle.sol';


//TODO : remove console log
import "hardhat/console.sol";

contract DotoliFactory is IDotoliFactory {

    address public uniswapV3Factory = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    address public dotoli;
    address public oracle;
    address public override weth9;
    address public override router;

    address public override owner;
    uint256 public override managerFee = 10000; // 10000 : 1%, 3000 : 0.3%
    uint256 public override minPoolAmount = 1e18; // to be whiteListToken, needed min weth9 value of (token + weth9) pool
    
    mapping(address => bool) public override whiteListTokens;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address _dotoli, address _weth9, address _router, address _oracle) {
        owner = msg.sender;
        dotoli = _dotoli;
        weth9 = _weth9;
        router = _router;
        oracle = _oracle;
        whiteListTokens[weth9] = true;
        whiteListTokens[dotoli] = true;
        emit FactoryCreated();
    }

    function setOwner(address newOwner) external override {
        require(msg.sender == owner);
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    // minimum pool amount in eth to be white list token
    function setMinPoolAmount(uint256 amount) external override {
        require(msg.sender == owner);
        minPoolAmount = amount;
        emit MinPoolAmountChanged(amount);
    }

    function setManagerFee(uint256 _managerFee) external override {
        require(msg.sender == owner);
        managerFee = _managerFee;
        emit ManagerFeeChanged(_managerFee);
    }

    function setWhiteListToken(address _token) external override {
        require(msg.sender == owner);
        require(whiteListTokens[_token] == false, 'WLT');
        require(IUniswapV3Oracle(oracle).checkWhiteListToken(_token, minPoolAmount), 'CWLT');
        whiteListTokens[_token] = true;
        emit WhiteListTokenAdded(_token);
    }

    function resetWhiteListToken(address _token) external override {
        require(msg.sender == owner);
        require(whiteListTokens[_token] == true, 'WLT');
        require(_token != weth9 && _token != dotoli);
        whiteListTokens[_token] = false;
        emit WhiteListTokenRemoved(_token);
    }
}