



    function getManagerRewardUSD(address investor, uint256 withdrawValue, address _token, uint256 _amount) private returns (uint256) {
        require(address(investor) != 0, 'getManagerReward: Invalid investor address');
        uint256 managerRewardUSD = 0;
        uint256 investorTotalValueUSD = getInvestorTotalValueUSD(investor);
        uint256 investorProfitUSD = investorTotalValueUSD - investorPrincipalUSD[investor];
        if (investorProfitUSD > 0) {
            managerRewardUSD = investorProfitUSD * withdrawValue / investorTotalValueUSD;
        }
        return managerRewardUSD;
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




    function updateWithdrawInfo(address investor, address _token, uint256 _amount) private {

        uint256 withdrawValue = getPriceUSD(_token) * _amount;
        //if the investor receives a profit, send manager reward.
        uint256 managerRewardUSD = getManagerReward(investor, withdrawValue);
        if (managerRewardUSD > 0) {
            withdrawValue -= managerRewardUSD;
        }
        uint256 rewardTokenAmount = managerRewardUSD / getPriceUSD(_token);
        bool isNewRewardToken = increaseManagerRewardTokenAmount(_token, rewardTokenAmount);
        if (isNewRewardToken) {
            rewardTokens[rewardTokenCount].tokenAddress = _token;
            rewardTokens[rewardTokenCount].amount = rewardTokenAmount;
            rewardTokenCount += 1;
        }
        _amount -= rewardTokenAmount;

        //update fund info
        bool isNewFundToken = decreaseFundTokenAmount(_token, _amount);
        require(isNewFundToken == false, 'updateWithdrawInfo: Invalid fund token withdraw attempt');
        uint256 fundWithdrawRatio = withdrawValue / getFundTotalValueUSD();
        fundPrincipalUSD -= fundPrincipalUSD * fundWithdrawRatio;

        //update investor info
        bool isNewInvestorToken = decreaseInvestorTokenAmount(investor, _token, _amount);
        require(isNewInvestorToken == false, 'updateWithdrawInfo: Invalid investor token withdraw attempt');
        uint256 investorWithdrawRatio = withdrawValue / getInvestorTotalValueUSD(investor);
        investorPrincipalUSD[investor] -= investorPrincipalUSD[investor] * investorWithdrawRatio;
    }