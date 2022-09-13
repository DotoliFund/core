// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFund.sol';
import './interfaces/IXXXFactory.sol';
import './interfaces/IERC20.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';

import "hardhat/console.sol";

contract XXXFund is IXXXFund {
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

    function getDate() private returns (string memory){
        string memory date = '';
        return date;
    }

    function getTokenOutFromPath() private returns (address){
        return 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    }

    function getInvestorTokenAmount(address investor, address token) private returns (uint256){
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

    function isValidTokenAmount(address investor, address _token, uint256 _amount) private returns (bool) {
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


        // // Approve the router to spend the specifed `amountInMaximum` of tokenIn.
        // // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
        //address(0xc778417E063141139Fce010982780140Aa0cD5Ab).call(abi.encodeWithSelector(IERC20.approve.selector, 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45, 0x011C37937E080000));

        //test
        // uint256 amountOut;
        // ISwapRouter02.ExactInputSingleParams memory params =
        //     IV3SwapRouter.ExactInputSingleParams({
        //         tokenIn: 0xc778417E063141139Fce010982780140Aa0cD5Ab,
        //         tokenOut: 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984,
        //         fee: 500,
        //         recipient: address(this),
        //         //deadline: _params.deadline,
        //         //amountIn: 0x02c68af0bb140000,  //0.2
        //         amountIn: 0x011c37937e080000,   //0.08
        //         amountOutMinimum: 0x01802d909beab40d,
        //         sqrtPriceLimitX96: 0
        //     });

        //console.log(ISwapRouter02(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45).exactInputSingle(params));
        //(bool success, bytes memory response) = address(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45).call(abi.encodeWithSelector(IV3SwapRouter.exactInputSingle.selector, params));
        //amountOut = ISwapRouter02(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45).exactInputSingle(params);
        //console.log(amountOut);



        address investor = trades[0].investor;
        require(msg.sender == manager, 'swap: invalid sender');
        require(IXXXFactory(factory).isWhiteListToken(trades[0].tokenOut), 
            'swap: not whitelist token');
        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // Approve the router to spend the specifed `amountInMaximum` of tokenIn.
        // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
        //trades[0].tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trades[0].amountInMaximum));
        //trades[0].tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45, 0x011C37937E080000));

        uint256 investorAmount = getInvestorTokenAmount(investor, trades[0].tokenIn);
        uint256 swapInputAmount = 0;
        for (uint256 i=0; i<trades.length; i++) {
            swapInputAmount += trades[i].amountIn;
        }
        require(investorAmount >= swapInputAmount, 'swap: invalid inputAmount');


        uint256 amountIn;
        uint256 amountOut;
        for(uint256 i=0; i<trades.length; i++) {
            if (trades[i].swapType == V3SwapType.SINGLE_HOP) {
                if (trades[i].tradeType == V3TradeType.EXACT_INPUT) {
                    // approve
                    trades[i].tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trades[i].amountIn));
                    // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
                    // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
                    ISwapRouter02.ExactInputSingleParams memory params =
                        IV3SwapRouter.ExactInputSingleParams({
                            tokenIn: trades[i].tokenIn,
                            tokenOut: trades[i].tokenOut,
                            fee: trades[i].fee,
                            recipient: address(this),
                            amountIn: trades[i].amountIn,
                            amountOutMinimum: trades[i].amountOutMinimum,
                            sqrtPriceLimitX96: 0
                        });
                    amountIn = trades[i].amountIn;
                    amountOut = ISwapRouter02(_swapRouterAddress).exactInputSingle(params);
                } else {
                    // approve
                    trades[i].tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trades[i].amountInMaximum));

                    ISwapRouter02.ExactOutputSingleParams memory params =
                        IV3SwapRouter.ExactOutputSingleParams({
                            tokenIn: trades[i].tokenIn,
                            tokenOut: trades[i].tokenOut,
                            fee: trades[i].fee,
                            recipient: address(this),
                            amountOut: trades[i].amountOut,
                            amountInMaximum: trades[i].amountInMaximum,
                            sqrtPriceLimitX96: 0
                        });
                    amountIn = ISwapRouter02(_swapRouterAddress).exactOutputSingle(params);
                    amountOut = trades[i].amountOut;
                }
            } else {
                if (trades[i].tradeType == V3TradeType.EXACT_INPUT) {
                    // approve
                    trades[i].tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trades[i].amountIn));

                    ISwapRouter02.ExactInputParams memory params =
                        IV3SwapRouter.ExactInputParams({
                            path: trades[i].path,
                            recipient: address(this),
                            amountIn: trades[i].amountIn,
                            amountOutMinimum: trades[i].amountOut
                        });
                    amountIn = trades[i].amountIn;
                    amountOut = ISwapRouter02(_swapRouterAddress).exactInput(params);
                } else {
                    // approve
                    trades[i].tokenIn.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trades[i].amountInMaximum));

                    ISwapRouter02.ExactOutputParams memory params =
                        IV3SwapRouter.ExactOutputParams({
                            path: trades[i].path,
                            recipient: address(this),
                            amountOut: trades[i].amountOut,
                            amountInMaximum: trades[i].amountIn
                        });
                    amountIn = ISwapRouter02(_swapRouterAddress).exactOutput(params);
                    amountOut = trades[i].amountOut;
                }
            }
            updateSwapInfo(investor, trades[0].tokenIn, trades[0].tokenOut, amountIn, amountOut);
            emit Swap(investor, trades[0].tokenIn, trades[0].tokenOut, amountIn, amountOut);
        }
        return 1;
    }
}