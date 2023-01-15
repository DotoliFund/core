// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import './libraries/FullMath.sol';
import './interfaces/IXXXFactory.sol';
import './XXXFund2.sol';


//TODO : remove console log
import "hardhat/console.sol";

contract XXXFactory is IXXXFactory, Constants {
    address public override WETH9;
    address public UNI;
    address public XXX;

    address public override owner;
    uint256 public override managerFee = 10000; // 10000 : 1%, 3000 : 0.3%
    uint256 public override minPoolAmount = 1e18; // to be whiteListToken, needed min weth9 value of (token + weth9) pool
    
    mapping(address => bool) public override whiteListTokens;
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

    constructor(address weth9, address uni, address xxx) {
        owner = msg.sender;
        WETH9 = weth9;
        UNI = uni;
        XXX = xxx;
        whiteListTokens[WETH9] = true;
        whiteListTokens[UNI] = true;
        whiteListTokens[XXX] = true;
        emit FactoryCreated();
    }

    function createFund() external override returns (address fund) {
        require(getFundByManager[msg.sender] == address(0), 'FUND_EXISTS');
        fund = address(new XXXFund2{salt: keccak256(abi.encode(address(this), msg.sender))}());
        getFundByManager[msg.sender] = fund;
        IXXXFund2(fund).initialize(msg.sender);

        //manager subscribe
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

    function isSubscribed(address investor, address fund) public override view returns (bool) {
        uint256 fundCount = getFundCountByInvestor[investor];
        for (uint256 i=0; i<fundCount; i++) {
            if (fund == getFundByInvestor[investor][i]) {
                return true;
            }
        }
        return false;
    }

    function subscribedFunds(address investor) external override view returns (address[] memory){
        uint256 fundCount = getFundCountByInvestor[investor];
        address[] memory funds;
        funds = new address[](fundCount);
        for (uint256 i=0; i<fundCount; i++) {
            funds[i] = getFundByInvestor[investor][i];
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

    function checkWhiteListToken(address _token) private returns (bool) {
        uint16[3] memory fees = [500, 3000, 10000];
        uint256 poolAmount = 0;

        for (uint256 i=0; i<fees.length; i++) {
            address pool = IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(_token, WETH9, uint24(fees[i]));
            if (pool == address(0)) {
                continue;
            }
            address token0 = IUniswapV3Pool(pool).token0();
            address token1 = IUniswapV3Pool(pool).token1();
            uint256 token0Decimal = 10 ** IERC20Minimal(token0).decimals();
            uint256 token1Decimal = 10 ** IERC20Minimal(token1).decimals();

            uint256 amount0 = IERC20Minimal(token0).balanceOf(pool);
            uint256 amount1 = IERC20Minimal(token1).balanceOf(pool);
            (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();

            uint256 numerator = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
            uint256 price0 = FullMath.mulDiv(numerator, token0Decimal, 1 << 192);
            //tokenPriceInWETH
            if (token0 == WETH9) {
                poolAmount += ((amount1 / price0) * token1Decimal) + amount0;
                console.log(poolAmount / token0Decimal);
            } else if (token1 == WETH9) {
                poolAmount += ((amount0 / token0Decimal) * price0) + amount1;
                console.log(poolAmount / token1Decimal);
            } else {
                continue;
            }        
        }

        if (poolAmount >= minPoolAmount) {
            return true;
        } else {
            return false;
        }
    }

    function setWhiteListToken(address _token) external override {
        require(msg.sender == owner);
        require(whiteListTokens[_token] == false, 'WLT');
        require(checkWhiteListToken(_token), 'CWLT');
        whiteListTokens[_token] = true;
        emit WhiteListTokenAdded(_token);
    }

    function resetWhiteListToken(address _token) external override {
        require(msg.sender == owner);
        require(whiteListTokens[_token] == true, 'WLT');
        require(_token != WETH9 && _token != XXX);
        whiteListTokens[_token] = false;
        emit WhiteListTokenRemoved(_token);
    }
}