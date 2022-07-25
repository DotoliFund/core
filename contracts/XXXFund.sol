// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.9;

import './interfaces/IXXXFund.sol';
import './XXXERC20.sol';
import './interfaces/IERC20.sol';
import './interfaces/IXXXFactory.sol';

contract XXXFund is IXXXFund, XXXERC20 {
    using SafeMath  for uint;

    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));


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


    struct Token {
        
        address tokenAddress;

        string name;

        uint amount;

        uint fiatPrice;

        uint etherPrice;

    }


    struct History {

        string date;

        address fundAddress;

        address fundManager;

        Token[] tokens;

        uint totalFiatValue;

        uint totalEtherValue;

        string type;

        address swapFrom;

        address swapTo;

    }


    address public factory;
    address public manager;
    address[] public allTokens;

    address[] public holders;
    mapping(address => uint) public shares;

    mapping(address => uint) public reservedToken;
    History[] public history;

    uint SHARE_DECIMAL = 1000 ** 2; 

    uint private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'XXXFund: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function getFiatPrice(address token) returns (uint fiatPrice) {
        fiatPrice = 0; 
    }

    function getTotalFiatValue() returns (uint totalFiatValue) {
        uint totalFiatValue = 0;
        for (uint i = 0; i < allTokens.length; i++) {
            address token = allTokens[i];
            uint tokenFiatPrice = getFiatPrice(token);
            uint tokenAmount = reservedToken[token];
            require(tokenFiatPrice >= 0);
            totalFiatValue += tokenFiatPrice * tokenAmount;
        }
    }

    function getReserves(address token) public view returns (uint _reserve) {
        _reserve = reserveToken[token];
    }

    function _safeTransfer(address token, address to, uint value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(SELECTOR, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'XXXFund: TRANSFER_FAILED');
    }

    event Deposit(address indexed sender, uint amount0, uint amount1);
    event Withdraw(address indexed sender, uint amount0, uint amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    constructor(address _manager) public {
        factory = msg.sender;
    }

    // called once by the factory at time of deployment
    function initialize(address _manager, address _token, uint _amount) external {
        require(msg.sender == factory, 'XXXFund: FORBIDDEN'); // sufficient check
        require(allTokens.length == 0);
        require(_manager != address(0));
        manager = _manager;
        allTokens.push(_token);
        reserveToken[_token] = _amount;
    }

    // update reserves and, on the first call per block, price accumulators
    function _update(uint balance0, uint balance1, uint112 _reserve0, uint112 _reserve1) private {


        // require(balance0 <= uint112(-1) && balance1 <= uint112(-1), 'UniswapV2: OVERFLOW');
        // uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        // reserve0 = uint112(balance0);
        // reserve1 = uint112(balance1);
        // emit Sync(reserve0, reserve1);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address sender, address _token, uint _amount) external lock {
        require(msg.sender == sender); // sufficient check
        for (uint256 i = 0; i < allTokens.length; i++) {
            address token = allTokens[i];
            if (token == _token) {
                reserveToken[_token] += _amount;
                depositFiatValue = getFiatValue(_token, _amount);
                reservedFiatValue = getReservedFiatValue();
                newShare = SHARE_DECIMAL * depositFiatValue / (reservedFiatValue + depositFiatValue);

                shares[sender] = newShare;
                for (uint256 i = 0; i < holders.length; i++) {
                    address otherHolder = holders[i];
                    if (otherHolder == sender) {
                        continue;
                    }
                    shares[otherHolder] = (((SHARE_DECIMAL * 1) - newShare) * shares[holders]) / SHARE_DECIMAL;
                }
                return;
            }
        }
        allTokens.push(_token);
        reserveToken[_token] = _amount;







        // (uint112 _reserve0, uint112 _reserve1,) = getReserves(); // gas savings
        // uint balance0 = IERC20(token0).balanceOf(address(this));
        // uint balance1 = IERC20(token1).balanceOf(address(this));
        // uint amount0 = balance0.sub(_reserve0);
        // uint amount1 = balance1.sub(_reserve1);

        // uint _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _depositFee
        // if (_totalSupply == 0) {
        //     liquidity = Math.sqrt(amount0.mul(amount1)).sub(MINIMUM_LIQUIDITY);
        //    _deposit(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        // } else {
        //     liquidity = Math.min(amount0.mul(_totalSupply) / _reserve0, amount1.mul(_totalSupply) / _reserve1);
        // }
        // require(liquidity > 0, 'UniswapV2: INSUFFICIENT_LIQUIDITY_DEPOSITED');
        // _deposit(to, liquidity);

        // _update(balance0, balance1, _reserve0, _reserve1);
        // emit Deposit(msg.sender, amount0, amount1);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function withdraw(address to) external lock returns (uint amount0, uint amount1) {









        // (uint112 _reserve0, uint112 _reserve1,) = getReserves(); // gas savings
        // address _token0 = token0;                                // gas savings
        // address _token1 = token1;                                // gas savings
        // uint balance0 = IERC20(_token0).balanceOf(address(this));
        // uint balance1 = IERC20(_token1).balanceOf(address(this));
        // uint liquidity = balanceOf[address(this)];

        // uint _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        // amount0 = liquidity.mul(balance0) / _totalSupply; // using balances ensures pro-rata distribution
        // amount1 = liquidity.mul(balance1) / _totalSupply; // using balances ensures pro-rata distribution
        // require(amount0 > 0 && amount1 > 0, 'UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED');
        // _burn(address(this), liquidity);
        // _safeTransfer(_token0, to, amount0);
        // _safeTransfer(_token1, to, amount1);
        // balance0 = IERC20(_token0).balanceOf(address(this));
        // balance1 = IERC20(_token1).balanceOf(address(this));

        // _update(balance0, balance1, _reserve0, _reserve1);
        // emit Burn(msg.sender, amount0, amount1, to);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external lock {











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

    // force reserves to match balances
    function sync() external lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), reserve0, reserve1);
    }
}