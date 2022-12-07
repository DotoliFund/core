// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '../interfaces/IToken.sol';
import '../base/Constants.sol';

abstract contract Token is IToken, Constants {

    function getTokens(Token[] memory tokens) internal view returns (Token[] memory) {
        Token[] memory _tokens = new Token[](tokens.length);
        for (uint i = 0; i < tokens.length; i++) {
            _tokens[i] = tokens[i];
        }
        return _tokens;
    }

    function getTokenAmount(Token[] memory tokens, address token) internal view returns (uint256) {
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].tokenAddress == token) {
                return tokens[i].amount;
            }
        }
        return 0;
    }

    function increaseToken(Token[] storage tokens, address token, uint256 amount) internal {
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

    function decreaseToken(Token[] storage tokens, address token, uint256 amount) internal returns (bool) {
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].tokenAddress == token) {
                require(tokens[i].amount >= amount, 'TNE');
                tokens[i].amount -= amount;
                if (tokens[i].amount == 0) {
                    uint256 lastIndex = tokens.length-1;
                    address lastTokenAddress = tokens[lastIndex].tokenAddress;
                    uint256 lastTokenAmount = tokens[lastIndex].amount;
                    tokens[i].tokenAddress = lastTokenAddress;
                    tokens[i].amount = lastTokenAmount;
                    tokens.pop();
                }
                return true;
            }
        }
        return false;
    }
}