// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFund.sol';
import './interfaces/IXXXFactory.sol';
import './interfaces/IERC20.sol';


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

    function getTokenOutFromPath() private returns (address){
        return 0xE592427A0AEce92De3Edee1F18E0157C05861564;
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
        require(isNewFundToken == false, 'updateWithdrawInfo: invalid fund token withdraw attempt');
        uint256 withdrawValue = getPriceUSD(_token) * _amount;
        uint256 fundWithdrawRatio = withdrawValue / getFundTotalValueUSD();
        fundPrincipalUSD -= fundPrincipalUSD * fundWithdrawRatio;

        //update investor info
        bool isNewInvestorToken = decreaseInvestorTokenAmount(investor, _token, _amount);
        require(isNewInvestorToken == false, 'updateWithdrawInfo: Invalid investor token withdraw attempt');
        uint256 investorWithdrawRatio = withdrawValue / getInvestorTotalValueUSD(investor);
        investorPrincipalUSD[investor] -= investorPrincipalUSD[investor] * investorWithdrawRatio;
    }

    function updateSwapInfo(address investor, address swapFrom, address swapTo, uint256 swapFromAmount, uint256 swapToAmount) external {
        require(msg.sender == IXXXFactory(factory).getSwapRouterAddress(), "updateSwapInfo: invalid swapRouter");
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



    function unwrapWETH9WithFee(address _swapRouterAddress, ISwapRouter02.ExactInputSingleParams calldata params) internal lock {
        
    }

    function unwrapWETH9(address _swapRouterAddress, ISwapRouter02.ExactInputSingleParams calldata params) internal lock {
        
    }

    function refundETH(address _swapRouterAddress, ISwapRouter02.ExactInputSingleParams calldata params) internal lock {
        
    }

}