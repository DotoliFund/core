// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/external/IWETH9.sol';
import './interfaces/IXXXFund2.sol';
import './interfaces/IXXXFactory.sol';
import './interfaces/IERC20.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import './libraries/PriceOracle.sol';
import './SwapRouter.sol';

import "hardhat/console.sol";

contract XXXFund2 is IXXXFund2, SwapRouter {
    using Path for bytes;

    address UNISWAP_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    address WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    //address WETH9 = 0xc778417E063141139Fce010982780140Aa0cD5Ab;
    address USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

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
                uint256 volumeETH = getVolumeETH(managerTokens);
                uint256 volumeUSD = getVolumeUSD(managerTokens);
                emit ManagerDeposit(msg.sender, WETH9, msg.value, volumeETH, volumeUSD);
            } else {
                bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
                require(_isSubscribed, 'receive() => account is not subscribed');
                IWETH9(WETH9).deposit{value: msg.value}();
                increaseToken(investorTokens[msg.sender], WETH9, msg.value);
                increaseToken(fundTokens, WETH9, msg.value);
                uint256 volumeETH = getVolumeETH(investorTokens[msg.sender]);
                uint256 volumeUSD = getVolumeUSD(investorTokens[msg.sender]);
                emit InvestorDeposit(msg.sender, WETH9, msg.value, volumeETH, volumeUSD);
            }
        }
    }

    function initialize(address _manager) override external {
        require(msg.sender == factory, 'initialize() => FORBIDDEN'); // sufficient check
        manager = _manager;
        emit Initialize(_manager);
    }

    function getFundTokens() external override view returns (Token[] memory) {
        uint256 tokenCount = fundTokens.length;
        Token[] memory _fundTokens = new Token[](tokenCount);
        for (uint256 i; i<tokenCount; i++) {
            _fundTokens[i] = fundTokens[i];
        }
        return _fundTokens;
    }

    function getManagerTokens() external override view returns (Token[] memory) {
        uint256 tokenCount = managerTokens.length;
        Token[] memory _managerTokens = new Token[](tokenCount);
        for (uint256 i; i<tokenCount; i++) {
            _managerTokens[i] = managerTokens[i];
        }
        return _managerTokens;
    }

    function getFeeTokens() external override view returns (Token[] memory) {
        Token[] memory _feeTokens = new Token[](feeTokens.length);
        for (uint i = 0; i < feeTokens.length; i++) {
            _feeTokens[i] = feeTokens[i];
        }
        return _feeTokens;
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory) {
        uint256 tokenCount = investorTokens[investor].length;
        Token[] memory _investorTokens = new Token[](tokenCount);
        for (uint256 i; i<tokenCount; i++) {
            _investorTokens[i] = investorTokens[investor][i];
        }
        return _investorTokens;
    }

    function getUserTokenAmount(address investor, address token) public override view returns (uint256) {
        if (investor == manager) {
            //manager
            for (uint256 i=0; i<managerTokens.length; i++) {
                if (managerTokens[i].tokenAddress == token) {
                    return managerTokens[i].amount;
                }
            }
        } else {
            //investor
            for (uint256 i=0; i<investorTokens[investor].length; i++) {
                if (investorTokens[investor][i].tokenAddress == token) {
                    return investorTokens[investor][i].amount;
                }
            }
        }
        return 0;
    }

    function increaseToken(Token[] storage tokens, address token, uint256 amount) private {
        bool isNewToken = true;
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].tokenAddress == token) {
                isNewToken = false;
                tokens[i].amount += amount;
                break;
            }
        }
        if (isNewToken) {
            tokens.push(Token(token, amount));      
        }
    }

    function decreaseToken(Token[] storage tokens, address token, uint256 amount) private {
        bool isNewToken = true;
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].tokenAddress == token) {
                isNewToken = false;
                require(tokens[i].amount >= amount, 'decreaseToken() => not enough token');
                tokens[i].amount -= amount;
                break;
            }
        }
        require(isNewToken == false, 'decreaseToken() => token is not exist');
    }

    function isManagerTokenSufficient(address _token, uint256 _amount) private view returns (bool) {
        bool _isTokenSufficient = false;
        for (uint256 i=0; i<managerTokens.length; i++) {
            if (managerTokens[i].tokenAddress == _token) {
                require(managerTokens[i].amount >= _amount, 'isManagerTokenSufficient() => not enough token');
                _isTokenSufficient = true;
                break;
            }
        }
        return _isTokenSufficient;
    }

    function isInvestorTokenSufficient(address investor, address _token, uint256 _amount) private view returns (bool) {
        bool _isTokenSufficient = false;
        for (uint256 i=0; i<investorTokens[investor].length; i++) {
            if (investorTokens[investor][i].tokenAddress == _token) {
                require(investorTokens[investor][i].amount >= _amount, 'isInvestorTokenSufficient() => not enough token');
                _isTokenSufficient = true;
                break;
            }
        }
        return _isTokenSufficient;
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
        uint256 volumeETH = getVolumeETH(feeTokens);
        uint256 volumeUSD = getVolumeUSD(feeTokens);
        emit ManagerFeeIn(investor, manager, _token, _amount, volumeETH, volumeUSD);
    }

    function feeOut(address _token, uint256 _amount) external payable override lock {
        require(msg.sender == manager, 'feeOut() => only manager can withdraw fee');
        bool isNewToken = true;
        for (uint256 i=0; i<feeTokens.length; i++) {
            if (feeTokens[i].tokenAddress == _token) {
                isNewToken = false;
                require(feeTokens[i].amount >= _amount, 'feeOut() => token is not exist');
                if (_token == WETH9) {
                    IWETH9(WETH9).withdraw(_amount);
                    (bool success, ) = (msg.sender).call{value: _amount}(new bytes(0));
                    require(success, 'feeOut() => sending ETH to manager failed');
                } else {
                    IERC20(_token).transfer(msg.sender, _amount);
                }
                feeTokens[i].amount -= _amount;
                break;
            }
        }
        require(isNewToken == false, 'feeOut() => token is not exist');
        decreaseToken(fundTokens, _token, _amount);
        uint256 volumeETH = getVolumeETH(feeTokens);
        uint256 volumeUSD = getVolumeUSD(feeTokens);
        emit ManagerFeeOut(manager, _token, _amount, volumeETH, volumeUSD);
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
            uint256 volumeETH = getVolumeETH(managerTokens);
            uint256 volumeUSD = getVolumeUSD(managerTokens);
            emit ManagerDeposit(msg.sender, _token, _amount, volumeETH, volumeUSD);
        } else {
            increaseToken(investorTokens[msg.sender], _token, _amount);
            increaseToken(fundTokens, _token, _amount);
            uint256 volumeETH = getVolumeETH(investorTokens[msg.sender]);
            uint256 volumeUSD = getVolumeUSD(investorTokens[msg.sender]);
            emit InvestorDeposit(msg.sender, _token, _amount, volumeETH, volumeUSD);
        }
    }

    function withdraw(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'withdraw() => account is not exist in manager list nor investor list');
        uint256 managerFee = IXXXFactory(factory).getManagerFee();

        if (msg.sender == manager) {
            require(isManagerTokenSufficient(_token, _amount), 'withdraw() => invalid token amount');
            // manager withdraw is no need manager fee
            if (_token == WETH9) {
                IWETH9(WETH9).withdraw(_amount);
                (bool success, ) = (msg.sender).call{value: _amount}(new bytes(0));
                require(success, 'withdraw() => sending ETH to manager failed');
            } else {
                IERC20(_token).transfer(msg.sender, _amount);
            }
            decreaseToken(managerTokens, _token, _amount);
            decreaseToken(fundTokens, _token, _amount);
            uint256 volumeETH = getVolumeETH(managerTokens);
            uint256 volumeUSD = getVolumeUSD(managerTokens);
            emit ManagerWithdraw(msg.sender, _token, _amount, volumeETH, volumeUSD);
        } else {
            require(isInvestorTokenSufficient(msg.sender, _token, _amount), 'withdraw() => invalid token amount');
            //if investor has a profit, send manager fee.
            uint256 feeAmount = _amount * managerFee / 100;
            if (_token == WETH9) {
                IWETH9(WETH9).withdraw(_amount - feeAmount);
                (bool success, ) = (msg.sender).call{value: _amount - feeAmount}(new bytes(0));
                require(success, 'withdraw() => sending ETH to investor failed');
            } else {
                IERC20(_token).transfer(msg.sender, _amount - feeAmount);
            }
            feeIn(msg.sender, _token, feeAmount);
            decreaseToken(investorTokens[msg.sender], _token, _amount);
            decreaseToken(fundTokens, _token, _amount);
            uint256 volumeETH = getVolumeETH(investorTokens[msg.sender]);
            uint256 volumeUSD = getVolumeUSD(investorTokens[msg.sender]);
            emit InvestorWithdraw(msg.sender, _token, _amount, feeAmount, volumeETH, volumeUSD);
        }
    }

    function handleSwap(
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        uint256 volumeETH = 0;
        uint256 volumeUSD = 0;
        //update manager info
        if (investor == manager) {
            //update manager info
            decreaseToken(managerTokens, swapFrom, swapFromAmount);
            increaseToken(managerTokens, swapTo, swapToAmount);
            volumeETH = getVolumeETH(managerTokens);
            volumeUSD = getVolumeUSD(managerTokens);
        } else {
            //update investor info
            decreaseToken(investorTokens[investor], swapFrom, swapFromAmount);
            increaseToken(investorTokens[investor], swapTo, swapToAmount);
            volumeETH = getVolumeETH(investorTokens[investor]);
            volumeUSD = getVolumeUSD(investorTokens[investor]);
        }
        decreaseToken(fundTokens, swapFrom, swapFromAmount);
        increaseToken(fundTokens, swapTo, swapToAmount);
        emit Swap(
            manager,
            investor,
            swapFrom, 
            swapTo, 
            swapFromAmount, 
            swapToAmount,
            volumeETH,
            volumeUSD
        );
    }

    function swap(V3TradeParams[] calldata trades) external payable override lock {
        require(msg.sender == manager, 'swap() => invalid sender');
        address swapRouter = IXXXFactory(factory).getSwapRouterAddress();

        for(uint256 i=0; i<trades.length; i++) {

            if (trades[i].swapType == V3SwapType.SINGLE_HOP) {
                uint256 tokenBalance = getUserTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(tokenBalance >= trades[i].amountIn, 'exactInputSingle() => invalid inputAmount');

                if (trades[i].tradeType == V3TradeType.EXACT_INPUT) {
                    uint256 amountOut = SwapRouter.exactInputSingle(factory, swapRouter, trades[i]);
                    handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, trades[i].amountIn, amountOut);
                } else {
                    uint256 amountIn = SwapRouter.exactOutputSingle(factory, swapRouter, trades[i]);
                    handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, amountIn, trades[i].amountOut);
                }
            } else {
                if (trades[i].tradeType == V3TradeType.EXACT_INPUT) {
                    address tokenOut = SwapRouter.getLastTokenFromPath(trades[i].path);
                    (address tokenIn, , ) = trades[i].path.decodeFirstPool();

                    uint256 tokenBalance = getUserTokenAmount(trades[i].investor, tokenIn);
                    require(tokenBalance >= trades[i].amountIn, 'exactInput() => invalid inputAmount');

                    uint256 amountOut = SwapRouter.exactInput(factory, swapRouter, trades[i], tokenIn, tokenOut);
                    handleSwap(trades[i].investor, tokenIn, tokenOut, trades[i].amountIn, amountOut);
                } else {
                    address tokenIn = getLastTokenFromPath(trades[i].path);
                    (address tokenOut, , ) = trades[i].path.decodeFirstPool();

                    uint256 tokenBalance = getUserTokenAmount(trades[i].investor, tokenIn);
                    require(tokenBalance >= trades[i].amountInMaximum, 'exactOutput() => invalid inputAmount');

                    uint256 amountIn = SwapRouter.exactOutput(factory, swapRouter, trades[i], tokenIn, tokenOut);
                    handleSwap(trades[i].investor, tokenIn, tokenOut, amountIn, trades[i].amountOut);
                }
            }
        }
    }

    function getVolumeETH(Token[] memory tokens) private view returns (uint256 volumeETH) {
        volumeETH = 0;
        for (uint256 i=0; i<tokens.length; i++) {
            address token = tokens[i].tokenAddress;
            uint256 amount = tokens[i].amount;
            volumeETH += PriceOracle.getPriceETH(UNISWAP_V3_FACTORY, token, WETH9) * amount;
        }
    }

    function getVolumeUSD(Token[] memory tokens) private view returns (uint256 volumeUSD) {
        volumeUSD = 0;
        for (uint256 i=0; i<tokens.length; i++) {
            address token = tokens[i].tokenAddress;
            uint256 amount = tokens[i].amount;
            volumeUSD += PriceOracle.getPriceUSD(UNISWAP_V3_FACTORY, token, USDC) * amount;
        }    
    }
}