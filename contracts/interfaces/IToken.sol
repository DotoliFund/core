// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

interface IToken {

    struct Token {
        address tokenAddress;
        uint256 amount;
    }

    function getFundVolumeETH(Token[] memory tokens) external returns (uint256);
    function getFundVolumeUSD(Token[] memory tokens) external returns (uint256);

    function getManagerVolumeETH(Token[] memory tokens) external returns (uint256);
    function getManagerVolumeUSD(Token[] memory tokens) external returns (uint256);

    function getInvestorVolumeETH(Token[] memory tokens) external returns (uint256);
    function getInvestorVolumeUSD(Token[] memory tokens) external returns (uint256);
    
    function getManagerFeeVolumeETH(Token[] memory tokens) external returns (uint256);
    function getManagerFeeVolumeUSD(Token[] memory tokens) external returns (uint256);
}
