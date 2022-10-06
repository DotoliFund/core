// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFund2.sol';
import './interfaces/IXXXFactory.sol';
import './interfaces/IERC20.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import './libraries/PriceOracle.sol';
import './base/SwapRouter.sol';
import './base/Payments.sol';
import './base/Constants.sol';
import './base/Token.sol';

import "hardhat/console.sol";

contract XXXFund2 is 
    IXXXFund2,
    SwapRouter,
    Constants,
    Payments,
    Token
{
    using Path for bytes;

    address public factory;
    address public manager;

    // manager tokens and all investors tokens in fund
    Token[] public fundTokens;

    // tokens
    Token[] public managerTokens;
    Token[] public feeTokens; //manager fee
    mapping(address => Token[]) public investorTokens;
    
    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'Fund LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        factory = msg.sender;
    }

    receive() external payable {
        if (msg.sender == WETH9) {
            // when call IWETH9(WETH9).withdraw(amount) in this contract, go into here.
        } else {
            if (msg.sender == manager) {
                IWETH9(WETH9).deposit{value: msg.value}();
                increaseToken(managerTokens, WETH9, msg.value);
                increaseToken(fundTokens, WETH9, msg.value);
                uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, WETH9, WETH9) * msg.value;
                uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, WETH9, USDC) * msg.value;
                emit ManagerDeposit(msg.sender, WETH9, msg.value, amountETH, amountUSD);
            } else {
                bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
                require(_isSubscribed, 'receive() => account is not subscribed');
                IWETH9(WETH9).deposit{value: msg.value}();
                increaseToken(investorTokens[msg.sender], WETH9, msg.value);
                increaseToken(fundTokens, WETH9, msg.value);
                uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, WETH9, WETH9) * msg.value;
                uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, WETH9, USDC) * msg.value;
                emit InvestorDeposit(msg.sender, WETH9, msg.value, amountETH, amountUSD);
            }
        }
    }

    function initialize(address _manager) override external {
        require(msg.sender == factory, 'initialize() => FORBIDDEN'); // sufficient check
        manager = _manager;
        emit Initialize(_manager);
    }

    function getFundTokens() external override view returns (Token[] memory) {
        return getTokens(fundTokens);
    }

    function getManagerTokens() external override view returns (Token[] memory) {
        return getTokens(managerTokens);
    }

    function getFeeTokens() external override view returns (Token[] memory) {
        return getTokens(feeTokens);
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory) {
        return getTokens(investorTokens[investor]);
    }

    function getUserTokenAmount(address investor, address token) public override view returns (uint256) {
        if (investor == manager) {
            //manager
            return getTokenAmount(managerTokens, token);
        } else {
            //investor
            return getTokenAmount(investorTokens[investor], token);
        }
    }

    function isTokenEnough(Token[] memory tokens, address _token, uint256 _amount) private view returns (bool) {
        bool isEnough = false;
        uint256 tokenAmount = getTokenAmount(tokens, _token);
        require(tokenAmount >= _amount, 'isTokenEnough() => not enough token');
        isEnough = true;
        return isEnough;
    }

    function feeIn(address investor, address _token, uint256 _amount) private {
        bool isNewToken = true;
        for (uint256 i=0; i<feeTokens.length; i++) {
            if (feeTokens[i].tokenAddress == _token) {
                isNewToken = false;
                feeTokens[i].amount += _amount;
                break;
            }
        }
        if (isNewToken) {
            feeTokens.push(Token(_token, _amount));
        }
        uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
        uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
        emit ManagerFeeIn(investor, manager, _token, _amount, amountETH, amountUSD);
    }

    function feeOut(address _token, uint256 _amount) external payable override lock {
        require(msg.sender == manager, 'feeOut() => only manager can withdraw fee');
        bool isNewToken = true;
        for (uint256 i=0; i<feeTokens.length; i++) {
            if (feeTokens[i].tokenAddress == _token) {
                isNewToken = false;
                require(feeTokens[i].amount >= _amount, 'feeOut() => token is not exist');
                _withdraw(_token, _amount);
                feeTokens[i].amount -= _amount;
                break;
            }
        }
        require(isNewToken == false, 'feeOut() => token is not exist');
        decreaseToken(fundTokens, _token, _amount);
        uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
        uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
        emit ManagerFeeOut(manager, _token, _amount, amountETH, amountUSD);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'deposit() => account is not exist');
        require(IXXXFactory(factory).isWhiteListToken(_token), 'deposit() => not whitelist token');

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);

        if (msg.sender == manager) {
            increaseToken(managerTokens, _token, _amount);
            increaseToken(fundTokens, _token, _amount);
            uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
            uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
            emit ManagerDeposit(msg.sender, _token, _amount, amountETH, amountUSD);
        } else {
            increaseToken(investorTokens[msg.sender], _token, _amount);
            increaseToken(fundTokens, _token, _amount);
            uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
            uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
            emit InvestorDeposit(msg.sender, _token, _amount, amountETH, amountUSD);
        }
    }

    function withdraw(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'withdraw() => account is not exist in manager list nor investor list');
        uint256 managerFee = IXXXFactory(factory).getManagerFee();

        if (msg.sender == manager) {
            require(isTokenEnough(managerTokens, _token, _amount), 'withdraw() => invalid token amount');
            // manager withdraw is no need manager fee
            _withdraw(_token, _amount);
            decreaseToken(managerTokens, _token, _amount);
            decreaseToken(fundTokens, _token, _amount);
            uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
            uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
            emit ManagerWithdraw(msg.sender, _token, _amount, amountETH, amountUSD);
        } else {
            require(isTokenEnough(investorTokens[msg.sender], _token, _amount), 'withdraw() => invalid token amount');
            //if investor has a profit, send manager fee.
            uint256 feeAmount = _amount * managerFee / 100;
            _withdraw(_token, _amount - feeAmount);
            feeIn(msg.sender, _token, feeAmount);
            decreaseToken(investorTokens[msg.sender], _token, _amount);
            decreaseToken(fundTokens, _token, _amount);
            uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
            uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
            emit InvestorWithdraw(msg.sender, _token, _amount, feeAmount, amountETH, amountUSD);
        }
    }

    function handleSwap(
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        //update manager info
        if (investor == manager) {
            //update manager info
            decreaseToken(managerTokens, swapFrom, swapFromAmount);
            increaseToken(managerTokens, swapTo, swapToAmount);
        } else {
            //update investor info
            decreaseToken(investorTokens[investor], swapFrom, swapFromAmount);
            increaseToken(investorTokens[investor], swapTo, swapToAmount);
        }
        decreaseToken(fundTokens, swapFrom, swapFromAmount);
        increaseToken(fundTokens, swapTo, swapToAmount);
        uint256 amountETH = PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, swapTo, WETH9) * swapToAmount;
        uint256 amountUSD = PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, swapTo, USDC) * swapToAmount;
        emit Swap(
            manager,
            investor,
            swapFrom, 
            swapTo, 
            swapFromAmount, 
            swapToAmount,
            amountETH,
            amountUSD
        );
    }

    function swap(V3TradeParams[] calldata trades) external payable override lock {
        require(msg.sender == manager, 'swap() => invalid sender');
        address swapRouter = IXXXFactory(factory).getSwapRouterAddress();

        for(uint256 i=0; i<trades.length; i++) {

            if (trades[i].swapType == V3SwapType.SINGLE_HOP) {
                uint256 tokenBalance = getUserTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(tokenBalance >= trades[i].amountIn, 'singleHop => too much input amount');

                if (trades[i].tradeType == V3TradeType.EXACT_INPUT) {
                    uint256 amountOut = exactInputSingle(factory, swapRouter, trades[i]);
                    handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, trades[i].amountIn, amountOut);
                } else {
                    uint256 amountIn = exactOutputSingle(factory, swapRouter, trades[i]);
                    handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, amountIn, trades[i].amountOut);
                }
            } else {
                if (trades[i].tradeType == V3TradeType.EXACT_INPUT) {
                    address tokenOut = getLastTokenFromPath(trades[i].path);
                    (address tokenIn, , ) = trades[i].path.decodeFirstPool();

                    uint256 tokenBalance = getUserTokenAmount(trades[i].investor, tokenIn);
                    require(tokenBalance >= trades[i].amountIn, 'exactInput() => too much input amount');

                    uint256 amountOut = exactInput(factory, swapRouter, trades[i], tokenIn, tokenOut);
                    handleSwap(trades[i].investor, tokenIn, tokenOut, trades[i].amountIn, amountOut);
                } else {
                    address tokenIn = getLastTokenFromPath(trades[i].path);
                    (address tokenOut, , ) = trades[i].path.decodeFirstPool();

                    uint256 tokenBalance = getUserTokenAmount(trades[i].investor, tokenIn);
                    require(tokenBalance >= trades[i].amountInMaximum, 'exactOutput() => too much input amount');

                    uint256 amountIn = exactOutput(factory, swapRouter, trades[i], tokenIn, tokenOut);
                    handleSwap(trades[i].investor, tokenIn, tokenOut, amountIn, trades[i].amountOut);
                }
            }
        }
    }
}