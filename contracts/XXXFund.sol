// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.8.4;
pragma abicoder v2;

import './interfaces/IXXXFund.sol';
import './interfaces/IXXXFactory.sol';

import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

contract XXXFund is IXXXFund {
    address public factory;
    address public manager;

    //manager history used for nonfungible trading history
    ReservedTokenHistory[] reservedTokenHistory;
    ManagerHistory[] managerHistory;

    //fund info
    uint256 fundPrincipalUSD = 0;
    mapping(uint256 => Token) public fundTokens;
    uint256 public fundTokenCount = 0;
    //investor info
    mapping(address => uint256) public investorPrincipalUSD;
    mapping(address => mapping(uint256 => Token)) public investorTokens;
    mapping(address => uint256) public investorTokenCount;
    //fund manager profit rewards added, only if the investor receives a profit.
    mapping(uint256 => Token) public rewardTokens;
    uint256 public rewardTokenCount = 0;

    event Deposit(address indexed sender, address _token, uint256 _amount);
    event Withdraw(address indexed sender, address _token, uint256 _amount);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

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
    
    function getPriceUSD(address token) private returns (uint256 fiatPrice) {
        fiatPrice = 0; 
    }

    function getFundTotalValueUSD() private returns (uint256 totalFiatValue) {
        totalFiatValue = 0;
    }

    function getInvestorTotalValueUSD(address investor) private returns (uint256 totalFiatValue) {
        totalFiatValue = 0;
    }

    function getDate() private returns (string memory){
        string memory date = '';
        return date;
    }

    // called once by the factory at time of deployment
    function initialize(address _manager, address _token, uint256 _amount) override external {
        require(msg.sender == factory, 'XXXFund initialize: FORBIDDEN'); // sufficient check
        require(_amount > 0, 'XXXFund initialize: token amount is insufficient'); // sufficient check
        require(_token != address(0), 'XXXFund initialize: token address is 0'); // sufficient check
        require(IXXXFactory(factory).isWhiteListToken(_token), 'XXXFund initialize: not whitelist token');

        manager = _manager;

        Token memory token;
        token.tokenAddress = _token;
        token.amount = _amount;
        uint256 depositValue = getPriceUSD(_token) * _amount;

        investorTokens[_manager][0] = token;
        investorPrincipalUSD[_manager] += depositValue;

        fundTokens[fundTokenCount] = token;
        fundTokenCount += 1;
        fundPrincipalUSD += depositValue;

        emit Deposit(manager, _token, _amount);
    }

    function increaseFundTokenAmount(address _token, uint256 _amount) private returns (bool){
        bool isNewToken = true;
        for (uint256 i=0; i<fundTokenCount; i++) {
            if (fundTokens[i].tokenAddress == _token) {
                isNewToken = false;
                fundTokens[i].amount += _amount;
                break;
            }
        }
        return isNewToken;
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

    function decreaseFundTokenAmount(address _token, uint256 _amount) private returns (bool){
        bool isNewToken = true;
        for (uint256 i=0; i<fundTokenCount; i++) {
            if (fundTokens[i].tokenAddress == _token) {
                isNewToken = false;
                require(fundTokens[i].amount >= _amount, 'decreaseTokenAmount: decrease token amount is more than you have');
                fundTokens[i].amount -= _amount;
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
        //update fund info
        bool isNewFundToken = increaseFundTokenAmount(_token, _amount);
        if (isNewFundToken) {
            fundTokens[fundTokenCount].tokenAddress = _token;
            fundTokens[fundTokenCount].amount = _amount;
            fundTokenCount += 1;
        }
        uint256 depositValue = getPriceUSD(_token) * _amount;
        fundPrincipalUSD += depositValue;

        //update investor info
        bool isNewInvestorToken = increaseInvestorTokenAmount(investor, _token, _amount);
        if (isNewInvestorToken) {
            uint256 newTokenIndex = investorTokenCount[investor];
            investorTokens[investor][newTokenIndex].tokenAddress = _token;
            investorTokens[investor][newTokenIndex].amount = _amount;
            investorTokenCount[investor] += 1;
        }
        investorPrincipalUSD[investor] += depositValue;
    }

    function updateWithdrawInfo(address investor, address _token, uint256 _amount) private {
        //update fund info
        bool isNewFundToken = decreaseFundTokenAmount(_token, _amount);
        require(isNewFundToken == false, 'updateWithdrawInfo: Invalid fund token withdraw attempt');
        uint256 withdrawValue = getPriceUSD(_token) * _amount;
        uint256 fundWithdrawRatio = withdrawValue / getFundTotalValueUSD();
        fundPrincipalUSD -= fundPrincipalUSD * fundWithdrawRatio;

        //update investor info
        bool isNewInvestorToken = decreaseInvestorTokenAmount(investor, _token, _amount);
        require(isNewInvestorToken == false, 'updateWithdrawInfo: Invalid investor token withdraw attempt');
        uint256 investorWithdrawRatio = withdrawValue / getInvestorTotalValueUSD(investor);
        investorPrincipalUSD[investor] -= investorPrincipalUSD[investor] * investorWithdrawRatio;
    }

    function updateSwapInfo(address investor, address swapFrom, address swapTo, uint256 swapFromAmount, uint256 swapToAmount) private {
        require(msg.sender == manager, "Not manager");
        //update fund info
        //decrease part of swap (decrease swapFrom token reduce by swapFromAmount)
        bool isNewFundToken = decreaseFundTokenAmount(swapFrom, swapFromAmount);
        require(isNewFundToken == false, 'updateSwapInfo: Invalid fund token swap attempt');
        //increase part of swap (increase swapTo token increase by swapToAmount)
        isNewFundToken = increaseFundTokenAmount(swapTo, swapToAmount);
        if (isNewFundToken) {
            fundTokens[fundTokenCount].tokenAddress = swapTo;
            fundTokens[fundTokenCount].amount = swapToAmount;
            fundTokenCount += 1;
        }

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

    function getManagerReward(address investor, address _token, uint256 _amount) private returns (uint256) {
        uint256 withdrawValue = getPriceUSD(_token) * _amount;
        require(address(investor) != address(0), 'getManagerReward: Invalid investor address');
        uint256 managerReward = 0;
        uint256 investorTotalValue = getInvestorTotalValueUSD(investor);
        uint256 investorProfit = investorTotalValue - investorPrincipalUSD[investor];
        if (investorProfit > 0) {
            managerReward = investorProfit * IXXXFactory(factory).getManagerFee() * withdrawValue / investorTotalValue;
        }
        return managerReward;
    }

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
        // Transfer the specified amount of token to this contract.
        TransferHelper.safeTransferFrom(_token, investor, address(this), _amount);

        updateDepositInfo(investor, _token, _amount);

        emit Deposit(investor, _token, _amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function withdraw(address investor, address _token, uint256 _amount) override external lock {
        require(msg.sender == investor); // sufficient check
        //check if investor has valid token amount
        require(isValidTokenAmount(investor, _token, _amount) == true, 'withdraw: Invalid token');
        if (investor == manager) {
            // manager withdraw is no need manager fee
            TransferHelper.safeTransfer(_token, investor, _amount);
            updateWithdrawInfo(investor, _token, _amount);
        } else {
            //if investor has a profit, send manager reward.
            uint256 managerReward = getManagerReward(investor, _token, _amount);
            if (managerReward > 0) {
                uint256 rewardTokenAmount = managerReward / getPriceUSD(_token);
                bool isNewRewardToken = increaseManagerRewardTokenAmount(_token, rewardTokenAmount);
                if (isNewRewardToken) {
                    rewardTokens[rewardTokenCount].tokenAddress = _token;
                    rewardTokens[rewardTokenCount].amount = rewardTokenAmount;
                    rewardTokenCount += 1;
                }
                TransferHelper.safeTransfer(_token, investor, _amount - rewardTokenAmount);
                updateWithdrawInfo(investor, _token, _amount);

            } else {
                TransferHelper.safeTransfer(_token, investor, _amount);
                updateWithdrawInfo(investor, _token, _amount);
            }
        }

        emit Withdraw(investor, _token, _amount);
    }

    //todo change value
    function addReservedTokenHistory() override external {
        ReservedTokenHistory memory _ReservedTokenHistory;
        _ReservedTokenHistory.date = '2022-08-10';
        _ReservedTokenHistory.tokenAddress = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
        _ReservedTokenHistory.amount = 0;

        return reservedTokenHistory.push(_ReservedTokenHistory);
    }

    function getReservedTokenHistory() override external returns (ReservedTokenHistory[] memory) {
        uint256 reservedTokenHistoryCount = reservedTokenHistory.length;
        ReservedTokenHistory[] memory _reservedTokenHistory = new ReservedTokenHistory[](reservedTokenHistoryCount);
        for (uint256 i; i<reservedTokenHistoryCount; i++) {
            _reservedTokenHistory[i] = reservedTokenHistory[i];
        }
        return _reservedTokenHistory;
    }

    //todo change value
    function addManagerHistory() override external {
        ManagerHistory memory _managerHistory;
        _managerHistory.date = '2022-08-10';
        _managerHistory.fundPrincipalUSD = 0;
        _managerHistory.totalValueUSD = 0;
        _managerHistory.totalValueETH = 0;
        _managerHistory.profitRate = 0;

        return managerHistory.push(_managerHistory);
    }

    function getManagerHistory() override external returns (ManagerHistory[] memory) {
        uint256 managerHistoryCount = managerHistory.length;
        ManagerHistory[] memory _managerHistory = new ManagerHistory[](managerHistoryCount);
        for (uint256 i; i<managerHistoryCount; i++) {
            _managerHistory[i] = managerHistory[i];
        }
        return _managerHistory;
    }

    function swapExactInputSingle(ISwapRouter.ExactInputSingleParams calldata _params, address investor) override external lock returns (uint256 amountOut) {
        require(msg.sender == manager, "Not manager");
        require(IXXXFactory(factory).isWhiteListToken(_params.tokenOut), 'XXXFund swapExactInputSingle: not whitelist token');
        // msg.sender must approve this contract

        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // Approve the router to spend tokenIn.
        TransferHelper.safeApprove(_params.tokenIn, _swapRouterAddress, _params.amountIn);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: _params.tokenIn,
                tokenOut: _params.tokenOut,
                fee: _params.fee,
                recipient: address(this),
                deadline: _params.deadline,
                amountIn: _params.amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to `exactInputSingle` executes the swap.
        amountOut = ISwapRouter(_swapRouterAddress).exactInputSingle(params);

        updateSwapInfo(investor, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    }

    function swapExactOutputSingle(ISwapRouter.ExactOutputSingleParams calldata _params, address investor) override external lock returns (uint256 amountIn) {
        require(msg.sender == manager, "Not manager");
        require(IXXXFactory(factory).isWhiteListToken(_params.tokenOut), 'XXXFund swapExactOutputSingle: not whitelist token');
        address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

        // Approve the router to spend the specifed `amountInMaximum` of tokenIn.
        // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
        TransferHelper.safeApprove(_params.tokenIn, _swapRouterAddress, _params.amountInMaximum);

        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: _params.tokenIn,
                tokenOut: _params.tokenOut,
                fee: _params.fee,
                recipient: address(this),
                deadline: _params.deadline,
                amountOut: _params.amountOut,
                amountInMaximum: _params.amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        // Executes the swap returning the amountIn needed to spend to receive the desired amountOut.
        amountIn = ISwapRouter(_swapRouterAddress).exactOutputSingle(params);

        // For exact output swaps, the amountInMaximum may not have all been spent.
        // If the actual amount spent (amountIn) is less than the specified maximum amount, we must refund the msg.sender and approve the swapRouter to spend 0.
        if (amountIn < _params.amountInMaximum) {
            TransferHelper.safeApprove(_params.tokenIn, _swapRouterAddress, 0);
            TransferHelper.safeTransfer(_params.tokenIn, msg.sender, _params.amountInMaximum - amountIn);
        }

        updateSwapInfo(investor, _params.tokenIn, _params.tokenOut, amountIn, _params.amountOut);
    }

    // function swapExactInputMultihop(ISwapRouter.ExactInputParams calldata _params, address investor) override external lock returns (uint256 amountOut) {
    //     require(msg.sender == manager, "Not manager");
    //     address tokenOut = getTokenOutFromPath(_params.path);
    //     require(IXXXFactory(factory).isWhiteListToken(tokenOut), 'XXXFund swapExactInputMultihop: not whitelist token');

    //     address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

    //     // Approve the router to spend DAI.
    //     TransferHelper.safeApprove(DAI, _swapRouterAddress, _params.amountIn);

    //     // Multiple pool swaps are encoded through bytes called a `path`. A path is a sequence of token addresses and poolFees that define the pools used in the swaps.
    //     // The format for pool encoding is (tokenIn, fee, tokenOut/tokenIn, fee, tokenOut) where tokenIn/tokenOut parameter is the shared token across the pools.
    //     // Since we are swapping DAI to USDC and then USDC to WETH9 the path encoding is (DAI, 0.3%, USDC, 0.3%, WETH9).
    //     ISwapRouter.ExactInputParams memory params =
    //         ISwapRouter.ExactInputParams({
    //             path: _params.path, //abi.encodePacked(DAI, poolFee, USDC, poolFee, WETH9),
    //             recipient: address(this),
    //             deadline: _params.deadline,
    //             amountIn: _params.amountIn,
    //             amountOutMinimum: 0
    //         });

    //     // Executes the swap.
    //     amountOut = ISwapRouter(_swapRouterAddress).exactInput(params);

    //     //updateSwapInfo(investor, _params.tokenIn, _params.tokenOut, _params.amountIn, amountOut);
    // }

    // function swapExactOutputMultihop(ISwapRouter.ExactOutputParams calldata _params, address investor) override external lock returns (uint256 amountIn) {
    //     require(msg.sender == manager, "Not manager");
    //     address tokenOut = getTokenOutFromPath(_params.path);
    //     require(IXXXFactory(factory).isWhiteListToken(tokenOut), 'XXXFund swapExactOutputMultihop: not whitelist token');

    //     address _swapRouterAddress = IXXXFactory(factory).getSwapRouterAddress();

    //     // Approve the router to spend  `amountInMaximum`.
    //     TransferHelper.safeApprove(DAI, _swapRouterAddress, _params.amountInMaximum);

    //     // The parameter path is encoded as (tokenOut, fee, tokenIn/tokenOut, fee, tokenIn)
    //     // The tokenIn/tokenOut field is the shared token between the two pools used in the multiple pool swap. In this case USDC is the "shared" token.
    //     // For an exactOutput swap, the first swap that occurs is the swap which returns the eventual desired token.
    //     // In this case, our desired output token is WETH9 so that swap happpens first, and is encoded in the path accordingly.
    //     ISwapRouter.ExactOutputParams memory params =
    //         ISwapRouter.ExactOutputParams({
    //             path: _params.path, //abi.encodePacked(WETH9, poolFee, USDC, poolFee, DAI),
    //             recipient: address(this),
    //             deadline: block.timestamp,
    //             amountOut: _params.amountOut,
    //             amountInMaximum: _params.amountInMaximum
    //         });

    //     // Executes the swap, returning the amountIn actually spent.
    //     amountIn = ISwapRouter(_swapRouterAddress).exactOutput(params);

    //     // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we refund msg.sender and approve the router to spend 0.
    //     if (amountIn < _params.amountInMaximum) {
    //         TransferHelper.safeApprove(DAI, _swapRouterAddress, 0);
    //         TransferHelper.safeTransferFrom(DAI, address(this), msg.sender, _params.amountInMaximum - amountIn);
    //     }

    //     //updateSwapInfo(investor, _params.tokenIn, _params.tokenOut, amountIn, _params.amountOut);
    // }
}