// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/external/IWETH9.sol';
import './interfaces/IXXXFund2.sol';
import './interfaces/IXXXFactory.sol';
import './interfaces/IERC20.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';


import "hardhat/console.sol";

contract XXXFund2 is IXXXFund2 {
    using Path for bytes;

    address WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    //address WETH9 = 0xc778417E063141139Fce010982780140Aa0cD5Ab;

    address public factory;
    address public manager;

    Token[] private managerTokens;
    Token[] private feeTokens; //manager fee
    mapping(address => Token[]) private investorTokens;
    
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
                increaseManagerToken(WETH9, msg.value);
                emit ManagerDeposit(msg.sender, WETH9, msg.value);
            } else {
                bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
                require(_isSubscribed, 'receive() => account is not subscribed');
                IWETH9(WETH9).deposit{value: msg.value}();
                increaseInvestorToken(msg.sender, WETH9, msg.value);
                emit InvestorDeposit(msg.sender, WETH9, msg.value);
            }
        }
    }

    function initialize(address _manager) override external {
        require(msg.sender == factory, 'initialize() => FORBIDDEN'); // sufficient check
        manager = _manager;

        emit Initialize(_manager);
    }

    function getManagerTokenCount() external override view returns (uint256){
        return managerTokens.length;
    }

    function getManagerTokens() external override view returns (Token[] memory){
        uint256 tokenCount = managerTokens.length;
        Token[] memory _managerTokens = new Token[](tokenCount);
        for (uint256 i; i<tokenCount; i++) {
            _managerTokens[i] = managerTokens[i];
        }
        return _managerTokens;
    }

    function getFeeTokens() external override view returns (Token[] memory){
        require(msg.sender == manager);
        Token[] memory _feeTokens = new Token[](feeTokens.length);
        for (uint i = 0; i < feeTokens.length; i++) {
            _feeTokens[i] = feeTokens[i];
        }
        return _feeTokens;
    }

    function getInvestorTokenCount(address investor) external override view returns (uint256){
        require(msg.sender == manager || msg.sender == investor, 'getInvestorTokens() => invalid message sender');
        return investorTokens[investor].length;
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory){
        require(msg.sender == manager || msg.sender == investor, 'getInvestorTokens() => invalid message sender');
        uint256 tokenCount = investorTokens[investor].length;
        Token[] memory _investorTokens = new Token[](tokenCount);
        for (uint256 i; i<tokenCount; i++) {
            _investorTokens[i] = investorTokens[investor][i];
        }
        return _investorTokens;
    }

    function getTokenAmount(address investor, address token) public override view returns (uint256){
        require(msg.sender == manager || msg.sender == investor, 'getTokenAmount() => invalid investor');
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

    function increaseManagerToken(address _token, uint256 _amount) private {
        bool isNewToken = true;
        for (uint256 i=0; i<managerTokens.length; i++) {
            if (managerTokens[i].tokenAddress == _token) {
                isNewToken = false;
                managerTokens[i].amount += _amount;
                break;
            }
        }
        if (isNewToken) {
            managerTokens.push(Token(_token, _amount));      
        }
    }

    function decreaseManagerToken(address _token, uint256 _amount) private {
        bool isNewToken = true;
        for (uint256 i=0; i<managerTokens.length; i++) {
            if (managerTokens[i].tokenAddress == _token) {
                isNewToken = false;
                require(managerTokens[i].amount >= _amount, 'decreaseManagerToken() => decrease token amount is more than you have');
                managerTokens[i].amount -= _amount;
                break;
            }
        }
        require(isNewToken == false, 'decreaseManagerToken() => token is not exist');
    }

    function increaseInvestorToken(address investor, address _token, uint256 _amount) private {
        bool isNewToken = true;
        uint256 tokenCount = investorTokens[investor].length;
        for (uint256 i=0; i<tokenCount; i++) {
            if (investorTokens[investor][i].tokenAddress == _token) {
                isNewToken = false;
                investorTokens[investor][i].amount += _amount;
                break;
            }
        }
        if (isNewToken) {
            investorTokens[investor].push(Token(_token, _amount));         
        }
    }

    function decreaseInvestorToken(address investor, address _token, uint256 _amount) private {
        bool isNewToken = true;
        uint256 tokenCount = investorTokens[investor].length;
        for (uint256 i=0; i<tokenCount; i++) {
            if (investorTokens[investor][i].tokenAddress == _token) {
                isNewToken = false;
                require(investorTokens[investor][i].amount >= _amount, 'decreaseInvestorToken() => decrease token amount is more than you have');
                investorTokens[investor][i].amount -= _amount;
                break;
            }
        }
        require(isNewToken == false, 'decreaseInvestorToken() => token is not exist');
    }

    function handleSwap(
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        //decrease part of swap (decrease swapFrom token reduce by swapFromAmount)
        //increase part of swap (increase swapTo token increase by swapToAmount)

        //update manager info
        if (investor == manager) {
            //update manager info
            decreaseManagerToken(swapFrom, swapFromAmount);
            increaseManagerToken(swapTo, swapToAmount);
        } else {
            //update investor info
            decreaseInvestorToken(investor, swapFrom, swapFromAmount);
            increaseInvestorToken(investor, swapTo, swapToAmount);
        }
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
        emit ManagerFeeIn(investor, manager, _token, _amount);
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
        emit ManagerFeeOut(manager, _token, _amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'deposit() => account is not exist in manager list nor investor list');
        require(IXXXFactory(factory).isWhiteListToken(_token), 'deposit() => not whitelist token');

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);

        if (msg.sender == manager) {
            increaseManagerToken(_token, _amount);
            emit ManagerDeposit(msg.sender, _token, _amount);
        } else {
            increaseInvestorToken(msg.sender, _token, _amount);
            emit InvestorDeposit(msg.sender, _token, _amount);
        }
    }

    function withdraw(address _token, uint256 _amount) external payable override lock {
        bool _isSubscribed = IXXXFactory(factory).isSubscribed(msg.sender, address(this));
        require(_isSubscribed || msg.sender == manager,
            'withdraw() => account is not exist in manager list nor investor list');
        uint256 managerFee = IXXXFactory(factory).getManagerFee();

        if (msg.sender == manager) {
            //check if manager has valid token amount
            require(isManagerTokenSufficient(_token, _amount), 'withdraw() => invalid token amount');
            
            // manager withdraw is no need manager fee
            if (_token == WETH9) {
                IWETH9(WETH9).withdraw(_amount);
                (bool success, ) = (msg.sender).call{value: _amount}(new bytes(0));
                require(success, 'withdraw() => sending ETH to manager failed');
            } else {
                IERC20(_token).transfer(msg.sender, _amount);
            }
            decreaseManagerToken(_token, _amount);
            emit ManagerWithdraw(msg.sender, _token, _amount);
        } else {
            //check if investor has valid token amount
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
            decreaseInvestorToken(msg.sender, _token, _amount);
            emit InvestorWithdraw(msg.sender, _token, _amount, feeAmount);
        }
    }

    function getLastTokenFromPath(bytes memory path) private returns (address) {
        address _tokenOut;

        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
                _tokenOut = tokenOut;
                break;
            }
        }
        return _tokenOut;
    }

    function exactInputSingle(V3TradeParams memory trade) private returns (uint256 amountOut)
    {
        require(IXXXFactory(factory).isWhiteListToken(trade.tokenOut), 
            'exactInputSingle() => not whitelist token');

        uint256 tokenBalance = getTokenAmount(trade.investor, trade.tokenIn);
        require(tokenBalance >= trade.amountIn, 'exactInputSingle() => invalid inputAmount');

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // approve
        IERC20(trade.tokenIn).approve(_swapRouterAddress, trade.amountIn);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter02.ExactInputSingleParams memory params =
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: trade.tokenIn,
                tokenOut: trade.tokenOut,
                fee: trade.fee,
                recipient: address(this),
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum,
                sqrtPriceLimitX96: 0
            });
        amountOut = ISwapRouter02(_swapRouterAddress).exactInputSingle(params);

        handleSwap(trade.investor, trade.tokenIn, trade.tokenOut, trade.amountIn, amountOut);
        emit Swap(manager, trade.investor, trade.tokenIn, trade.tokenOut, trade.amountIn, amountOut);
    }

    function exactInput(V3TradeParams memory trade) private returns (uint256 amountOut)
    {
        address tokenOut = getLastTokenFromPath(trade.path);
        (address tokenIn, , ) = trade.path.decodeFirstPool();

        require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
            'exactInput() => not whitelist token');

        
        uint256 tokenBalance = getTokenAmount(trade.investor, tokenIn);
        require(tokenBalance >= trade.amountIn, 'exactInput() => invalid inputAmount');

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // approve
        IERC20(tokenIn).approve(_swapRouterAddress, trade.amountIn);

        ISwapRouter02.ExactInputParams memory params =
            IV3SwapRouter.ExactInputParams({
                path: trade.path,
                recipient: address(this),
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum
            });
        amountOut = ISwapRouter02(_swapRouterAddress).exactInput(params);

        handleSwap(trade.investor, tokenIn, tokenOut, trade.amountIn, amountOut);
        emit Swap(manager, trade.investor, tokenIn, tokenOut, trade.amountIn, amountOut);
    }

    function exactOutputSingle(V3TradeParams memory trade) private returns (uint256 amountIn)
    {
        require(IXXXFactory(factory).isWhiteListToken(trade.tokenOut), 
            'exactOutputSingle() => not whitelist token');

        uint256 tokenBalance = getTokenAmount(trade.investor, trade.tokenIn);
        require(tokenBalance >= trade.amountInMaximum, 'exactOutputSingle() => invalid inputAmount');

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // approve
        IERC20(trade.tokenIn).approve(_swapRouterAddress, trade.amountInMaximum);

        ISwapRouter02.ExactOutputSingleParams memory params =
            IV3SwapRouter.ExactOutputSingleParams({
                tokenIn: trade.tokenIn,
                tokenOut: trade.tokenOut,
                fee: trade.fee,
                recipient: address(this),
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum,
                sqrtPriceLimitX96: 0
            });
        amountIn = ISwapRouter02(_swapRouterAddress).exactOutputSingle(params);

        handleSwap(trade.investor, trade.tokenIn, trade.tokenOut, amountIn, trade.amountOut);
        emit Swap(manager, trade.investor, trade.tokenIn, trade.tokenOut, amountIn, trade.amountOut);
    }

    function exactOutput(V3TradeParams memory trade) private returns (uint256 amountIn)
    {
        address tokenIn = getLastTokenFromPath(trade.path);
        (address tokenOut, , ) = trade.path.decodeFirstPool();

        require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
            'exactOutput() => not whitelist token');

        uint256 tokenBalance = getTokenAmount(trade.investor, tokenIn);
        require(tokenBalance >= trade.amountInMaximum, 'exactOutput() => invalid inputAmount');

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // approve
        IERC20(tokenIn).approve(_swapRouterAddress, trade.amountInMaximum);

        ISwapRouter02.ExactOutputParams memory params =
            IV3SwapRouter.ExactOutputParams({
                path: trade.path,
                recipient: address(this),
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum
            });
        amountIn = ISwapRouter02(_swapRouterAddress).exactOutput(params);

        handleSwap(trade.investor, tokenIn, tokenOut, amountIn, trade.amountOut);
        emit Swap(manager, trade.investor, tokenIn, tokenOut, amountIn, trade.amountOut);
    }

    function swap(
        V3TradeParams[] calldata trades
    ) external payable override lock {
        // console.log("swap() parameter => ");
        // console.log("    tradeType : ", uint(trades[0].tradeType));
        // console.log("    swapType : ", uint(trades[0].swapType));
        // console.log("    investor : ", trades[0].investor);
        // console.log("    tokenIn : ", trades[0].tokenIn);
        // console.log("    tokenOut : ", trades[0].tokenOut);
        // console.log("    recipient : ", trades[0].recipient);
        // console.log("    fee : ", trades[0].fee);
        // console.log("    amountIn : ", trades[0].amountIn);
        // console.log("    amountOut : ", trades[0].amountOut);
        // console.log("    amountInMaximum : ", trades[0].amountOutMinimum);
        // console.log("    amountOutMinimum : ", trades[0].amountOutMinimum);
        // console.log("    sqrtPriceLimitX96 : ", trades[0].sqrtPriceLimitX96);
        // console.log("    path : ");
        // console.logBytes(trades[0].path);


        require(msg.sender == manager, 'swap() => invalid sender');

        for(uint256 i=0; i<trades.length; i++) {
            if (trades[i].swapType == V3SwapType.SINGLE_HOP) {
                if (trades[i].tradeType == V3TradeType.EXACT_INPUT) {
                    exactInputSingle(trades[i]);
                } else {
                    exactOutputSingle(trades[i]);
                }
            } else {
                if (trades[i].tradeType == V3TradeType.EXACT_INPUT) {
                    exactInput(trades[i]);
                } else {
                    exactOutput(trades[i]);
                }
            }
        }
    }
}