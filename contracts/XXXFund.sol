// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFund.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/IXXXFactory.sol';

import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

contract XXXFund is IXXXFund {


// [  {  date : 2022-07-23, 
// fundAddress : 0x3939,
// fundManager : 0x9943,
// tokens : [ { address : 0xasdf, name : ETH, amount : 100, price : $1 },
// { address : 0xqwer, name : LINK, amount : 100, price : $1 } ], 
// totalValue : $200,
// type : swap,
// swapFrom :  ETH,
// swapTo : LINK,
// swapAmountOfA: 100,
// swapAmountOfB : 100 },
// {  date : 2022-10-23,
// fundAddress : 0x3939,
// fundManager : 0x9943,
// tokens : [ { tokenAddress : 0xasdf, name : ETH, amount : 200, fiatPrice : $2, etherPrice : 0.1 },
// { address : 0xqwer, name : LINK, amount : 100, fiatPrice : $1, etherPrice : 0.05 } ], 
// totalValue : $500,
// type : deposit,
// depositor : 0x6436,
// depositToken : 0xasdf,
// depositAmount : 100,
// swapFrom :  null,
// swapTo : null,
// swapAmountOfA: null,
// swapAmountOfB : null } ]


    struct ReservedToken {
        
        address tokenAddress;

        string tokenName;

        uint amount;

        uint fiatPrice;

        uint etherPrice;

    }

    struct SwapHistory {

        string date;

        address fundAddress;

        address fundManager;

        address swapFrom;

        address swapTo;

        string swapFromName;

        string swapToName;

        ReservedToken[] reservedTokens;

        uint totalFiatValue;

        uint totalEtherValue;

        uint turnverRatio;

        uint rateOfReturn;
    }


    address public factory;
    address public manager;

    address[] public allTokens;
    mapping(address => uint) public reservedTokens;

    address[] public holders;
    mapping(address => uint) public shares;

    SwapHistory[] public swapHistory;

    uint SHARE_DECIMAL = 10 ** 6; 


    uint private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'XXXFund: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function getFiatPrice(address token) private returns (uint fiatPrice) {
        fiatPrice = 0; 
    }

    function getTotalFiatValue() private returns (uint totalFiatValue) {
        totalFiatValue = 0;
        for (uint i = 0; i < allTokens.length; i++) {
            address token = allTokens[i];
            uint tokenFiatPrice = getFiatPrice(token);
            uint tokenAmount = reservedTokens[token];
            require(tokenFiatPrice >= 0);
            totalFiatValue += tokenFiatPrice * tokenAmount;
        }
    }

    function getReserves(address token) public view returns (uint _reserve) {
        _reserve = reservedTokens[token];
    }


    event Deposit(address indexed sender, address _token, uint _amount);
    event Withdraw(address indexed sender, address _token, uint _amount);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );

    constructor() {
        factory = msg.sender;
    }

    // called once by the factory at time of deployment
    function initialize(address _manager, address _token, uint256 _amount) override external {
        require(msg.sender == factory, 'XXXFund: FORBIDDEN'); // sufficient check
        require(allTokens.length == 0);
        manager = _manager;

        if (_token != address(0) && _amount > 0) {
            uint share = 1 * SHARE_DECIMAL;
            bool success = IERC20Minimal(_token).transferFrom(manager, address(this), _amount);
            if (success) {
                //update share[]
                shares[manager] = share;
                //update allTokens[], reservedTokens[]
                allTokens.push(_token);
                reservedTokens[_token] = _amount;
                emit Deposit(manager, _token, _amount);
            }
        }
    }

    function getFiatValue(address token, uint256 _amount) private returns (uint fiatValue) {
        fiatValue = 0; 
    }

    function getReservedFiatValue() private returns (uint reservedFiatValue) {
        reservedFiatValue = 0; 
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address sender, address _token, uint256 _amount) override external lock {
        require(msg.sender == sender); // sufficient check

        uint depositFiatValue = getFiatValue(_token, _amount);
        uint reservedFiatValue = getReservedFiatValue();
        uint share = SHARE_DECIMAL * depositFiatValue / (reservedFiatValue + depositFiatValue);

        bool success = IERC20Minimal(_token).transferFrom(sender, address(this), _amount);

        if (success) {
            //update share[]
            for (uint256 i = 0; i < holders.length; i++) {
                shares[holders[i]] = (((SHARE_DECIMAL * 1) - share) * shares[holders[i]]) / SHARE_DECIMAL;
            }
            shares[sender] += share;
            //update allTokens[], reservedTokens[]
            for (uint256 j = 0; j < allTokens.length; j++) {
                address token = allTokens[j];
                if (token == _token) {
                    reservedTokens[_token] += _amount;
                    emit Deposit(msg.sender, _token, _amount);
                    return;
                }
            }
            allTokens.push(_token);
            reservedTokens[_token] = _amount;
            emit Deposit(sender, _token, _amount);
        }
    }

    // this low-level function should be called from a contract which performs important safety checks
    function withdraw(address _token, address to, uint256 _amount) override external lock {
        require(msg.sender == to); // sufficient check
        require(reservedTokens[_token] >= _amount);

        uint withdrawFiatValue = getFiatValue(_token, _amount);
        uint reservedFiatValue = getReservedFiatValue();
        uint share = SHARE_DECIMAL * withdrawFiatValue / reservedFiatValue;

        bool success = IERC20Minimal(_token).transferFrom(to, address(this), _amount);

        if (success) {
            //update share[]
            shares[to] -= share;
            for (uint256 i = 0; i < holders.length; i++) {
                shares[holders[i]] = ((SHARE_DECIMAL + ((SHARE_DECIMAL * share) / (SHARE_DECIMAL - share))) * shares[holders[i]]) / SHARE_DECIMAL;
            }
            //update allTokens[], reservedTokens[]
            for (uint256 j = 0; j < allTokens.length; j++) {
                address token = allTokens[j];
                if (token == _token) {
                    reservedTokens[_token] -= _amount;
                    emit Withdraw(to, _token, _amount);
                    return;
                }
            }
        }
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) override external lock {











        // require(amount0Out > 0 || amount1Out > 0, 'UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT');
        // (uint112 _reserve0, uint112 _reserve1,) = getReserves(); // gas savings
        // require(amount0Out < _reserve0 && amount1Out < _reserve1, 'UniswapV2: INSUFFICIENT_LIQUIDITY');

        // uint balance0;
        // uint balance1;
        // { // scope for _token{0,1}, avoids stack too deep errors
        // address _token0 = token0;
        // address _token1 = token1;
        // require(to != _token0 && to != _token1, 'UniswapV2: INVALID_TO');
        // if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out); // optimistically transfer tokens
        // if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out); // optimistically transfer tokens
        // if (data.length > 0) IUniswapV2Callee(to).uniswapV2Call(msg.sender, amount0Out, amount1Out, data);
        // balance0 = IERC20(_token0).balanceOf(address(this));
        // balance1 = IERC20(_token1).balanceOf(address(this));
        // }
        // uint amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        // uint amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        // require(amount0In > 0 || amount1In > 0, 'UniswapV2: INSUFFICIENT_INPUT_AMOUNT');
        // { // scope for reserve{0,1}Adjusted, avoids stack too deep errors
        // uint balance0Adjusted = balance0.mul(1000).sub(amount0In.mul(3));
        // uint balance1Adjusted = balance1.mul(1000).sub(amount1In.mul(3));
        // require(balance0Adjusted.mul(balance1Adjusted) >= uint(_reserve0).mul(_reserve1).mul(1000**2), 'UniswapV2: K');
        // }

        // _update(balance0, balance1, _reserve0, _reserve1);
        // emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

}