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
    address public override manager;

    // manager tokens and all investors tokens in fund
    Token[] public fundTokens;

    // tokens
    Token[] public feeTokens; //manager fee
    mapping(address => Token[]) public investorTokens;
    
    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'Fund LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address _manager) {
        factory = msg.sender;
        manager = _manager;
    }

    receive() external payable {
        if (msg.sender == WETH9) {
            // when call IWETH9(WETH9).withdraw(amount) in this contract, go into here.
        } else {
            bool isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
            require(isSubscribed, 'receive() => account is not subscribed');
            IWETH9(WETH9).deposit{value: msg.value}();
            increaseToken(investorTokens[msg.sender], WETH9, msg.value);
            increaseToken(fundTokens, WETH9, msg.value);
            uint256 amountETH = PriceOracle.getBestPoolPriceETH(UNISWAP_V3_FACTORY, WETH9, WETH9) * msg.value;
            uint256 amountUSD = PriceOracle.getBestPoolPriceUSD(UNISWAP_V3_FACTORY, WETH9, USDC) * msg.value;
            emit Deposit(address(this), manager, msg.sender, WETH9, msg.value, amountETH, amountUSD);
        }
    }

    function getFundTokens() external override view returns (Token[] memory) {
        return getTokens(fundTokens);
    }

    function getFeeTokens() external override view returns (Token[] memory) {
        return getTokens(feeTokens);
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory) {
        return getTokens(investorTokens[investor]);
    }

    function getInvestorTokenAmount(address investor, address token) public override view returns (uint256) {
        return getTokenAmount(investorTokens[investor], token);
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
        uint256 amountETH = PriceOracle.getBestPoolPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
        uint256 amountUSD = PriceOracle.getBestPoolPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
        emit ManagerFeeIn(address(this), investor, manager, _token, _amount, amountETH, amountUSD);
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
        uint256 amountETH = PriceOracle.getBestPoolPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
        uint256 amountUSD = PriceOracle.getBestPoolPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
        emit ManagerFeeOut(address(this), manager, _token, _amount, amountETH, amountUSD);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'deposit() => account is not exist');
        require(IXXXFactory(factory).isWhiteListToken(_token), 'deposit() => not whitelist token');

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);

        increaseToken(investorTokens[msg.sender], _token, _amount);
        increaseToken(fundTokens, _token, _amount);
        uint256 amountETH = PriceOracle.getBestPoolPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * _amount;
        uint256 amountUSD = PriceOracle.getBestPoolPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * _amount;
        emit Deposit(address(this), manager, msg.sender, _token, _amount, amountETH, amountUSD);
    }

    function withdraw(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'withdraw() => account is not exist in manager list nor investor list');
        uint256 managerFee = IXXXFactory(factory).getManagerFee();
        require(isTokenEnough(investorTokens[msg.sender], _token, _amount), 'withdraw() => invalid token amount');

        uint256 feeAmount = 0;
        uint256 withdrawAmount = 0;
        if (msg.sender == manager) {
            // manager withdraw is no need manager fee
            feeAmount = 0;
            withdrawAmount = _amount;
            _withdraw(_token, _amount);
        } else {
            // send manager fee.
            feeAmount = _amount * managerFee / 100;
            withdrawAmount = _amount - feeAmount;
            _withdraw(_token, withdrawAmount);
            feeIn(msg.sender, _token, feeAmount);
        }
        decreaseToken(investorTokens[msg.sender], _token, _amount);
        decreaseToken(fundTokens, _token, withdrawAmount);
        uint256 amountETH = PriceOracle.getBestPoolPriceETH(UNISWAP_V3_FACTORY, _token, WETH9) * withdrawAmount;
        uint256 amountUSD = PriceOracle.getBestPoolPriceUSD(UNISWAP_V3_FACTORY, _token, USDC) * withdrawAmount;
        emit Withdraw(address(this), manager, msg.sender, _token, withdrawAmount, feeAmount, amountETH, amountUSD);
    }

    function handleSwap(
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        //update info
        decreaseToken(investorTokens[investor], swapFrom, swapFromAmount);
        increaseToken(investorTokens[investor], swapTo, swapToAmount);
        decreaseToken(fundTokens, swapFrom, swapFromAmount);
        increaseToken(fundTokens, swapTo, swapToAmount);
        uint256 amountETH = PriceOracle.getBestPoolPriceETH(UNISWAP_V3_FACTORY, swapTo, WETH9) * swapToAmount;
        uint256 amountUSD = PriceOracle.getBestPoolPriceUSD(UNISWAP_V3_FACTORY, swapTo, USDC) * swapToAmount;
        emit Swap(
            address(this),
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
                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
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

                    uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, tokenIn);
                    require(tokenBalance >= trades[i].amountIn, 'exactInput() => too much input amount');

                    uint256 amountOut = exactInput(factory, swapRouter, trades[i], tokenIn, tokenOut);
                    handleSwap(trades[i].investor, tokenIn, tokenOut, trades[i].amountIn, amountOut);
                } else {
                    address tokenIn = getLastTokenFromPath(trades[i].path);
                    (address tokenOut, , ) = trades[i].path.decodeFirstPool();

                    uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, tokenIn);
                    require(tokenBalance >= trades[i].amountInMaximum, 'exactOutput() => too much input amount');

                    uint256 amountIn = exactOutput(factory, swapRouter, trades[i], tokenIn, tokenOut);
                    handleSwap(trades[i].investor, tokenIn, tokenOut, amountIn, trades[i].amountOut);
                }
            }
        }
    }

    function getFundVolumeETH() external override view returns (uint256 volumeETH) {
        return getVolumeETH(fundTokens);
    }
    function getFundVolumeUSD() external override view returns (uint256 volumeUSD) {
        return getVolumeUSD(fundTokens);
    }

    function getInvestorVolumeETH(address investor) external override view returns (uint256 volumeETH) {
        return getVolumeETH(investorTokens[investor]);
    }
    function getInvestorVolumeUSD(address investor) external override view returns (uint256 volumeUSD) {
        return getVolumeUSD(investorTokens[investor]);
    }

    function getManagerFeeVolumeETH() external override view returns (uint256 volumeETH) {
        return getVolumeETH(feeTokens);
    }
    function getManagerFeeVolumeUSD() external override view returns (uint256 volumeUSD) {
        return getVolumeUSD(feeTokens);
    }
}