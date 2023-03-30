// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '../interfaces/IToken.sol';

abstract contract Token is IToken {

    function getTokenAmount(Token[] memory tokens, address token) internal view returns (uint256) {
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].token == token) {
                return tokens[i].amount;
            }
        }
        return 0;
    }

    function increaseToken(Token[] storage tokens, address token, uint256 amount) internal {
        bool isNewToken = true;
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].token == token) {
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
            if (tokens[i].token == token) {
                require(tokens[i].amount >= amount, 'NET');
                tokens[i].amount -= amount;
                if (tokens[i].amount == 0) {
                    uint256 lastIndex = tokens.length-1;
                    address lastToken = tokens[lastIndex].token;
                    uint256 lastTokenAmount = tokens[lastIndex].amount;
                    tokens[i].token = lastToken;
                    tokens[i].amount = lastTokenAmount;
                    tokens.pop();
                }
                return true;
            }
        }
        return false;
    }
}