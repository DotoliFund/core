// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFund.sol';
import './interfaces/IXXXFactory.sol';
import './interfaces/IERC20.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IPeripheryPayments.sol';

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
        require(address(this) == IXXXFactory(factory).getFund(msg.sender), "updateSwapInfo: invalid swapRouter");

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
    function deposit(address investor, address _token, uint256 _amount) override external lock {
        require(msg.sender == investor); // sufficient check
        require(IXXXFactory(factory).isWhiteListToken(_token), 'XXXFund initialize: not whitelist token');
        
        _token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, investor, address(this), _amount));

        updateDepositInfo(investor, _token, _amount);

        emit Deposit(investor, _token, _amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function withdraw(address investor, address _token, uint256 _amount) override external lock {
        require(msg.sender == investor); // sufficient check
        //check if investor has valid token amount
        require(isValidTokenAmount(investor, _token, _amount) == true, 'withdraw: invalid token amount');

        _token.call(abi.encodeWithSelector(IERC20.transfer.selector, investor, _amount));

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
        emit Withdraw(investor, _token, _amount);
    }

    function swap(
        address invester,
        V3Trade[] calldata trades,
        SwapOptions calldata options
    ) external payable override returns (uint256) {
        require(msg.sender == manager, 'swapRouter: invalid sender');
        require(IXXXFactory(factory).isWhiteListToken(trades[0].output), 
            'XXXFund swapExactOutputSingle: not whitelist token');
        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // Approve the router to spend the specifed `amountInMaximum` of tokenIn.
        // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
        trades[0].input.call(abi.encodeWithSelector(IERC20.approve.selector, _swapRouterAddress, trades[0].amountInMaximum));

        uint256 investerAmount = getInvestorTokenAmount(invester, trades[0].input);
        uint256 swapInputAmount = 0;
        for (uint256 i=0; i<trades.length; i++) {
            swapInputAmount += trades[i].inputAmount;
        }
        require(investerAmount > swapInputAmount, 'swapRouter: invalid inputAmount');

        uint256 amountIn = 0;
        uint256 amountOut = 0;
        for(uint256 i=0; i<trades.length; i++) {

            // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
            // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
            ISwapRouter02.ExactInputSingleParams memory params =
                IV3SwapRouter.ExactInputSingleParams({
                    tokenIn: trades[i].input,
                    tokenOut: trades[i].output,
                    fee: options.fee,
                    recipient: msg.sender,
                    //deadline: _params.deadline,
                    amountIn: trades[i].inputAmount,
                    amountOutMinimum: trades[i].amountOutMinimum,
                    sqrtPriceLimitX96: 0
                });

            // The call to `exactInputSingle` executes the swap.
            amountIn += trades[i].inputAmount;
            amountOut += ISwapRouter02(_swapRouterAddress).exactInputSingle(params);
        }

        //updateSwapInfo(invester, tokenIn, tokenOut, amountIn, amountOut);
        //emit Swap(invester, tokenIn, tokenOut, amountIn, amountOut);

        return 1;
    }
}