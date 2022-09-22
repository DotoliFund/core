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

    address public factory;
    address public manager;

    //investor info
    mapping(address => mapping(uint256 => Token)) public investorTokens;
    mapping(address => uint256) public investorTokenCount;

    //fund manager profit rewards added, only if the investor receives a profit.
    Token[] public rewardTokens;

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
            bool _isInvestorFundExist = IXXXFactory(factory).isInvestorFundExist(msg.sender, address(this));
            require(_isInvestorFundExist || msg.sender == manager,
                'receive() => account is not exist in manager list nor investor list');

            IWETH9(WETH9).deposit{value: msg.value}();

            bool isNewInvestorToken = increaseInvestorTokenBalance(msg.sender, WETH9, msg.value);
            if (isNewInvestorToken) {
                uint256 newTokenIndex = investorTokenCount[msg.sender];
                investorTokens[msg.sender][newTokenIndex].tokenAddress = WETH9;
                investorTokens[msg.sender][newTokenIndex].amount = msg.value;
                investorTokenCount[msg.sender] += 1;
            }

            emit Deposit(msg.sender, WETH9, msg.value);
        }
    }

    function initialize(address _manager) override external {
        require(msg.sender == factory, 'initialize() => FORBIDDEN'); // sufficient check
        manager = _manager;

        emit Create(address(this), manager);
    }

    function getInvestorTokenCount(address investor) external override view returns (uint256){
        return investorTokenCount[investor];
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory){
        uint256 tokenCount = investorTokenCount[investor];
        Token[] memory _investorTokens = new Token[](tokenCount);
        for (uint256 i; i<tokenCount; i++) {
            _investorTokens[i] = investorTokens[investor][i];
        }
        return _investorTokens;
    }

    function getInvestorTokenAmount(address investor, address token) public override view returns (uint256){
        for (uint256 i=0; i<investorTokenCount[investor]; i++) {
            if (investorTokens[investor][i].tokenAddress == token) {
                return investorTokens[investor][i].amount;
            }
        }
        return 0;
    }

    function getRewardTokens() external override view returns (Token[] memory){
        Token[] memory _rewardTokens = new Token[](rewardTokens.length);
        for (uint i = 0; i < rewardTokens.length; i++) {
            _rewardTokens[i] = rewardTokens[i];
        }
        return _rewardTokens;
    }

    function increaseInvestorTokenBalance(address investor, address _token, uint256 _amount) private returns (bool){
        bool isNewToken = true;
        for (uint256 i=0; i<investorTokenCount[investor]; i++) {
            if (investorTokens[investor][i].tokenAddress == _token) {
                isNewToken = false;
                investorTokens[investor][i].amount += _amount;
                break;
            }
        }
        return isNewToken;
    }

    function decreaseInvestorTokenBalance(address investor, address _token, uint256 _amount) private returns (bool){
        bool isNewToken = true;
        for (uint256 i=0; i<investorTokenCount[investor]; i++) {
            if (investorTokens[investor][i].tokenAddress == _token) {
                isNewToken = false;
                require(investorTokens[investor][i].amount >= _amount, 'decreaseTokenAmount() => decrease token amount is more than you have');
                investorTokens[investor][i].amount -= _amount;
                break;
            }
        }
        return isNewToken;
    }

    function handleSwap(address investor, address swapFrom, address swapTo, uint256 swapFromAmount, uint256 swapToAmount) private {
        //update investor info
        //decrease part of swap (decrease swapFrom token reduce by swapFromAmount)
        bool isNewInvestorToken = decreaseInvestorTokenBalance(investor, swapFrom, swapFromAmount);
        require(isNewInvestorToken == false, 'handleSwap() => Invalid investor token withdraw attempt');
        //increase part of swap (increase swapTo token increase by swapToAmount)
        isNewInvestorToken = increaseInvestorTokenBalance(investor, swapTo, swapToAmount);
        if (isNewInvestorToken) {
            uint256 newTokenIndex = investorTokenCount[investor];
            investorTokens[investor][newTokenIndex].tokenAddress = swapTo;
            investorTokens[investor][newTokenIndex].amount = swapToAmount;
            investorTokenCount[investor] += 1;
        }
    }

    function isValidTokenAmount(address investor, address _token, uint256 _amount) private view returns (bool) {
        bool _isValidTokenAmount = false;
        for (uint256 i=0; i<investorTokenCount[investor]; i++) {
            if (investorTokens[investor][i].tokenAddress == _token) {
                require(investorTokens[investor][i].amount >= _amount, 'withdraw: Invalid withdraw token amount');
                _isValidTokenAmount = true;
                break;
            }
        }
        return _isValidTokenAmount;
    }

    function increaseManagerReward(address _token, uint256 _amount) private returns (bool){
        bool isNewToken = true;
        for (uint256 i=0; i<rewardTokens.length; i++) {
            if (rewardTokens[i].tokenAddress == _token) {
                isNewToken = false;
                rewardTokens[i].amount += _amount;
                break;
            }
        }
        if (isNewToken) {
            rewardTokens.push(Token(_token, _amount));
        }
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address investor, address _token, uint256 _amount) external payable override lock {
        require(msg.sender == investor); // sufficient check
        bool _isInvestorFundExist = IXXXFactory(factory).isInvestorFundExist(investor, address(this));
        require(_isInvestorFundExist || msg.sender == manager,
            'deposit() => account is not exist in manager list nor investor list');
        require(IXXXFactory(factory).isWhiteListToken(_token), 'deposit() => not whitelist token');
        
        IERC20(_token).transferFrom(investor, address(this), _amount);
        
        bool isNewInvestorToken = increaseInvestorTokenBalance(investor, _token, _amount);
        if (isNewInvestorToken) {
            uint256 newTokenIndex = investorTokenCount[investor];
            investorTokens[investor][newTokenIndex].tokenAddress = _token;
            investorTokens[investor][newTokenIndex].amount = _amount;
            investorTokenCount[investor] += 1;
        }
        console.log(789);
        emit Deposit(investor, _token, _amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function withdraw(address investor, address _token, uint256 _amount) external payable override lock {
        require(msg.sender == investor); // sufficient check
        bool _isInvestorFundExist = IXXXFactory(factory).isInvestorFundExist(investor, address(this));
        require(_isInvestorFundExist || msg.sender == manager,
            'withdraw() => account is not exist in manager list nor investor list');
        //check if investor has valid token amount
        require(isValidTokenAmount(investor, _token, _amount), 'withdraw() => invalid token amount');
        
        uint256 managerFee = IXXXFactory(factory).getManagerFee();

        if (investor == manager) {
            // manager withdraw is no need manager fee
            decreaseInvestorTokenBalance(investor, _token, _amount);
            if (_token == WETH9) {
                IWETH9(WETH9).withdraw(_amount);
                (bool success, ) = investor.call{value: _amount}(new bytes(0));
                require(success, 'withdraw() => sending ETH to manager failed');
            } else {
                IERC20(_token).transfer(investor, _amount);
            }
        } else {
            //if investor has a profit, send manager reward.
            uint256 rewardAmount = _amount * managerFee / 100;
            decreaseInvestorTokenBalance(investor, _token, _amount);
            increaseManagerReward(_token, rewardAmount);
            if (_token == WETH9) {
                IWETH9(WETH9).withdraw(_amount - rewardAmount);
                (bool success, ) = investor.call{value: _amount - rewardAmount}(new bytes(0));
                require(success, 'withdraw() => sending ETH to investor failed');
            } else {
                IERC20(_token).transfer(investor, _amount - rewardAmount);
            }
        }
        emit Withdraw(investor, _token, _amount);
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

        uint256 tokenBalance = getInvestorTokenAmount(trade.investor, trade.tokenIn);
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
        emit Swap(trade.investor, trade.tokenIn, trade.tokenOut, trade.amountIn, amountOut);
    }

    function exactInput(V3TradeParams memory trade) private returns (uint256 amountOut)
    {
        address tokenOut = getLastTokenFromPath(trade.path);
        (address tokenIn, , ) = trade.path.decodeFirstPool();

        require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
            'exactInput() => not whitelist token');

        
        uint256 tokenBalance = getInvestorTokenAmount(trade.investor, tokenIn);
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
        emit Swap(trade.investor, tokenIn, tokenOut, trade.amountIn, amountOut);
    }

    function exactOutputSingle(V3TradeParams memory trade) private returns (uint256 amountIn)
    {
        require(IXXXFactory(factory).isWhiteListToken(trade.tokenOut), 
            'exactOutputSingle() => not whitelist token');

        uint256 tokenBalance = getInvestorTokenAmount(trade.investor, trade.tokenIn);
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
        emit Swap(trade.investor, trade.tokenIn, trade.tokenOut, amountIn, trade.amountOut);
    }

    function exactOutput(V3TradeParams memory trade) private returns (uint256 amountIn)
    {
        address tokenIn = getLastTokenFromPath(trade.path);
        (address tokenOut, , ) = trade.path.decodeFirstPool();

        require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
            'exactOutput() => not whitelist token');

        uint256 tokenBalance = getInvestorTokenAmount(trade.investor, tokenIn);
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
        emit Swap(trade.investor, tokenIn, tokenOut, amountIn, trade.amountOut);
    }

    function swap(
        V3TradeParams[] calldata trades
    ) external payable override lock {
        console.log("swap() parameter => ");
        console.log("    tradeType : ", uint(trades[0].tradeType));
        console.log("    swapType : ", uint(trades[0].swapType));
        console.log("    investor : ", trades[0].investor);
        console.log("    tokenIn : ", trades[0].tokenIn);
        console.log("    tokenOut : ", trades[0].tokenOut);
        console.log("    recipient : ", trades[0].recipient);
        console.log("    fee : ", trades[0].fee);
        console.log("    amountIn : ", trades[0].amountIn);
        console.log("    amountOut : ", trades[0].amountOut);
        console.log("    amountInMaximum : ", trades[0].amountOutMinimum);
        console.log("    amountOutMinimum : ", trades[0].amountOutMinimum);
        console.log("    sqrtPriceLimitX96 : ", trades[0].sqrtPriceLimitX96);
        //console.log("    path : ");
        console.logBytes(trades[0].path);


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