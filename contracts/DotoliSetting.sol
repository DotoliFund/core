// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import './libraries/FullMath.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/IDotoliSetting.sol';

contract DotoliSetting is IDotoliSetting {

    address public uniswapV3Factory = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    address public override owner;
    address public override weth9;
    address public dotoli;

    uint256 public override managerFee = 10000; // 10000 : 1%, 3000 : 0.3%
    uint256 public override minPoolAmount = 1e18; // to be whiteListToken, needed min weth9 value of (token + weth9) pool
    
    mapping(address => bool) public override whiteListTokens;

    modifier onlyOwner() {
        require(msg.sender == owner, 'NO');
        _;
    }

    constructor(address _dotoli, address _weth9) {
        owner = msg.sender;
        dotoli = _dotoli;
        weth9 = _weth9;
        whiteListTokens[dotoli] = true;
        whiteListTokens[weth9] = true;
        emit SettingCreated();
    }

    function setOwner(address newOwner) external override onlyOwner {
        owner = newOwner;
        emit OwnerChanged(owner, newOwner);
    }

    // minimum pool amount in eth to be white list token
    function setMinPoolAmount(uint256 amount) external override onlyOwner {
        minPoolAmount = amount;
        emit MinPoolAmountChanged(amount);
    }

    function setManagerFee(uint256 _managerFee) external override onlyOwner {
        managerFee = _managerFee;
        emit ManagerFeeChanged(_managerFee);
    }

    function checkWhiteListToken(address _token) private view returns (bool) {
        uint16[3] memory fees = [500, 3000, 10000];
        uint256 poolAmount = 0;

        for (uint256 i=0; i<fees.length; i++) {
            address pool = IUniswapV3Factory(uniswapV3Factory).getPool(_token, weth9, uint24(fees[i]));
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
            if (token0 == weth9) {
                poolAmount += ((amount1 / price0) * token1Decimal) + amount0;
            } else if (token1 == weth9) {
                poolAmount += ((amount0 / token0Decimal) * price0) + amount1;
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

    function setWhiteListToken(address _token) external override onlyOwner {
        require(whiteListTokens[_token] == false, 'WLT');
        require(checkWhiteListToken(_token), 'CWLT');
        whiteListTokens[_token] = true;
        emit WhiteListTokenAdded(_token);
    }

    function resetWhiteListToken(address _token) external override onlyOwner {
        require(whiteListTokens[_token] == true, 'WLT');
        require(_token != weth9 && _token != dotoli);
        whiteListTokens[_token] = false;
        emit WhiteListTokenRemoved(_token);
    }
}