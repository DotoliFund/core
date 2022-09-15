// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFund2.sol';
import './interfaces/IXXXFactory.sol';
import './interfaces/IERC20.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';

import "hardhat/console.sol";

contract XXXFund2 is IXXXFund2 {
    using Path for bytes;

    address public factory;
    address public manager;

    //investor info
    mapping(address => mapping(uint256 => Token)) public investorTokens;
    mapping(address => uint256) public investorTokenCount;

    //fund manager profit rewards added, only if the investor receives a profit.
    mapping(uint256 => Token) public rewardTokens;
    uint256 public rewardTokenCount = 0;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'XXXFund: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        factory = msg.sender;
    }

    function initialize(address _manager) override external {
        require(msg.sender == factory, 'XXXFund initialize: FORBIDDEN'); // sufficient check
        manager = _manager;

        emit Create(address(this), manager);
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory){
        uint256 tokenCount = investorTokenCount[investor];
        Token[] memory _investorTokens = new Token[](tokenCount);
        for (uint256 i; i<tokenCount; i++) {
            _investorTokens[i] = investorTokens[investor][i];
        }
        return _investorTokens;
    }

    function getInvestorTokenBalance(address investor, address token) private view returns (uint256){
        for (uint256 i=0; i<investorTokenCount[investor]; i++) {
            if (investorTokens[investor][i].tokenAddress == token) {
                return investorTokens[investor][i].amount;
            }
        }
        return 0;
    }

    function increaseInvestorTokenAmount(address investor, address _token, uint256 _amount) private returns (bool){
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

    function decreaseInvestorTokenAmount(address investor, address _token, uint256 _amount) private returns (bool){
        bool isNewToken = true;
        for (uint256 i=0; i<investorTokenCount[investor]; i++) {
            if (investorTokens[investor][i].tokenAddress == _token) {
                isNewToken = false;
                require(investorTokens[investor][i].amount >= _amount, 'decreaseTokenAmount: decrease token amount is more than you have');
                investorTokens[investor][i].amount -= _amount;
                break;
            }
        }
        return isNewToken;
    }

    function updateDepositInfo(address investor, address _token, uint256 _amount) private {
        //update investor info
        bool isNewInvestorToken = increaseInvestorTokenAmount(investor, _token, _amount);
        if (isNewInvestorToken) {
            uint256 newTokenIndex = investorTokenCount[investor];
            investorTokens[investor][newTokenIndex].tokenAddress = _token;
            investorTokens[investor][newTokenIndex].amount = _amount;
            investorTokenCount[investor] += 1;
        }
    }

    function updateWithdrawInfo(address investor, address _token, uint256 _amount) private {
        //update investor info
        bool isNewInvestorToken = decreaseInvestorTokenAmount(investor, _token, _amount);
        require(isNewInvestorToken == false, 'updateWithdrawInfo: Invalid investor token withdraw attempt');
    }

    function updateSwapInfo(address investor, address swapFrom, address swapTo, uint256 swapFromAmount, uint256 swapToAmount) private {
        require(address(this) == IXXXFactory(factory).getFundByManager(msg.sender), "updateSwapInfo: invalid swapRouter");

        //update investor info
        //decrease part of swap (decrease swapFrom token reduce by swapFromAmount)
        bool isNewInvestorToken = decreaseInvestorTokenAmount(investor, swapFrom, swapFromAmount);
        require(isNewInvestorToken == false, 'updateSwapInfo: Invalid investor token withdraw attempt');
        //increase part of swap (increase swapTo token increase by swapToAmount)
        isNewInvestorToken = increaseInvestorTokenAmount(investor, swapTo, swapToAmount);
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

    // function getManagerReward(address investor, address _token, uint256 _amount) private returns (uint256) {
    //     uint256 withdrawValue = getPriceUSD(_token) * _amount;
    //     require(address(investor) != address(0), 'getManagerReward: Invalid investor address');
    //     uint256 managerReward = 0;
    //     uint256 investorTotalValue = getInvestorTotalValueUSD(investor);
    //     uint256 investorProfit = investorTotalValue - investorPrincipalUSD[investor];
    //     if (investorProfit > 0) {
    //         managerReward = investorProfit * IXXXFactory(factory).getManagerFee() * withdrawValue / investorTotalValue;
    //     }
    //     return managerReward;
    // }

    function increaseManagerRewardTokenAmount(address _token, uint256 _amount) private returns (bool){
        bool isNewToken = true;
        for (uint256 i=0; i<rewardTokenCount; i++) {
            if (rewardTokens[i].tokenAddress == _token) {
                isNewToken = false;
                rewardTokens[i].amount += _amount;
                break;
            }
        }
        return isNewToken;
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address investor, address _token, uint256 _amount) external payable override lock {
        require(msg.sender == investor); // sufficient check
        require(IXXXFactory(factory).isWhiteListToken(_token), 'XXXFund initialize: not whitelist token');
        
        //_token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, investor, address(this), _amount));
        IERC20(_token).transferFrom(investor, address(this), _amount);

        updateDepositInfo(investor, _token, _amount);

        console.log("deposit() => ");
        console.log("    investor : ", investor);
        console.log("    _token : ", _token);
        console.log("    _amount : ", _amount);
        emit Deposit(investor, _token, _amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function withdraw(address investor, address _token, uint256 _amount) external payable override lock {
        require(msg.sender == investor); // sufficient check
        //check if investor has valid token amount
        require(isValidTokenAmount(investor, _token, _amount) == true, 'withdraw: invalid token amount');

        //_token.call(abi.encodeWithSelector(IERC20.transfer.selector, investor, _amount));
        IERC20(_token).transfer(investor, _amount);

        // if (investor == manager) {
        //     // manager withdraw is no need manager fee
        //     _token.call(abi.encodeWithSelector(IERC20.transfer.selector, investor, _amount));
        //     updateWithdrawInfo(investor, _token, _amount);
        // } else {
        //     //if investor has a profit, send manager reward.
        //     uint256 managerReward = getManagerReward(investor, _token, _amount);
        //     if (managerReward > 0) {
        //         uint256 rewardTokenAmount = managerReward / getPriceUSD(_token);
        //         bool isNewRewardToken = increaseManagerRewardTokenAmount(_token, rewardTokenAmount);
        //         if (isNewRewardToken) {
        //             rewardTokens[rewardTokenCount].tokenAddress = _token;
        //             rewardTokens[rewardTokenCount].amount = rewardTokenAmount;
        //             rewardTokenCount += 1;
        //         }
        //         _token.call(abi.encodeWithSelector(IERC20.transfer.selector, investor, _amount - rewardTokenAmount));
        //         updateWithdrawInfo(investor, _token, _amount);

        //     } else {
        //         _token.call(abi.encodeWithSelector(IERC20.transfer.selector, investor, _amount));
        //         updateWithdrawInfo(investor, _token, _amount);
        //     }
        // }

        // console.log("withdraw() => ");
        // console.log("    investor : ", investor);
        // console.log("    _token : ", _token);
        // console.log("    _amount : ", _amount);
    }

    function getTokenOutFromPath(bytes memory path) private returns (address) {
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
            'swap: not whitelist token');

        uint256 tokenBalance = getInvestorTokenBalance(trade.investor, trade.tokenIn);
        require(tokenBalance >= trade.amountIn, 'swap: invalid inputAmount');

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // approve
        trade.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trade.amountIn));
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

        updateSwapInfo(trade.investor, trade.tokenIn, trade.tokenOut, trade.amountIn, amountOut);
        emit Swap(trade.investor, trade.tokenIn, trade.tokenOut, trade.amountIn, amountOut);
    }

    function exactInput(V3TradeParams memory trade) private returns (uint256 amountOut)
    {
        address tokenOut = getTokenOutFromPath(trade.path);
        require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
            'swap: not whitelist token');

        (address tokenIn, , ) = trade.path.decodeFirstPool();
        uint256 tokenBalance = getInvestorTokenBalance(trade.investor, tokenIn);
        require(tokenBalance >= trade.amountIn, 'swap: invalid inputAmount');

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // approve
        trade.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trade.amountIn));

        ISwapRouter02.ExactInputParams memory params =
            IV3SwapRouter.ExactInputParams({
                path: trade.path,
                recipient: address(this),
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum
            });
        amountOut = ISwapRouter02(_swapRouterAddress).exactInput(params);

        updateSwapInfo(trade.investor, trade.tokenIn, trade.tokenOut, trade.amountIn, amountOut);
        emit Swap(trade.investor, trade.tokenIn, trade.tokenOut, trade.amountIn, amountOut);
    }

    function exactOutputSingle(V3TradeParams memory trade) private returns (uint256 amountIn)
    {
        require(IXXXFactory(factory).isWhiteListToken(trade.tokenOut), 
            'swap: not whitelist token');

        uint256 tokenBalance = getInvestorTokenBalance(trade.investor, trade.tokenIn);
        require(tokenBalance >= trade.amountInMaximum, 'swap: invalid inputAmount');

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // approve
        trade.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trade.amountInMaximum));

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

        updateSwapInfo(trade.investor, trade.tokenIn, trade.tokenOut, amountIn, trade.amountOut);
        emit Swap(trade.investor, trade.tokenIn, trade.tokenOut, amountIn, trade.amountOut);
    }

    function exactOutput(V3TradeParams memory trade) private returns (uint256 amountIn)
    {
        address tokenOut = getTokenOutFromPath(trade.path);
        require(IXXXFactory(factory).isWhiteListToken(tokenOut), 
            'swap: not whitelist token');

        (address tokenIn, , ) = trade.path.decodeFirstPool();
        uint256 tokenBalance = getInvestorTokenBalance(trade.investor, tokenIn);
        require(tokenBalance >= trade.amountInMaximum, 'swap: invalid inputAmount');

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // approve
        trade.tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trade.amountInMaximum));

        ISwapRouter02.ExactOutputParams memory params =
            IV3SwapRouter.ExactOutputParams({
                path: trade.path,
                recipient: address(this),
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum
            });
        amountIn = ISwapRouter02(_swapRouterAddress).exactOutput(params);

        updateSwapInfo(trade.investor, trade.tokenIn, trade.tokenOut, amountIn, trade.amountOut);
        emit Swap(trade.investor, trade.tokenIn, trade.tokenOut, amountIn, trade.amountOut);
    }

    function swap(
        V3TradeParams[] calldata trades
    ) external payable override lock returns (uint256) {
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
        console.log("    path : ");
        console.logBytes(trades[0].path);


        require(msg.sender == manager, 'swap: invalid sender');

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
        return 1;
    }
}