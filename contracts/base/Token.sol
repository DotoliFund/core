// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '../interfaces/IToken.sol';
import '../base/Constants.sol';

/// @title Token
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

    function decreaseToken(Token[] storage tokens, address token, uint256 amount) internal {
        bool isNewToken = true;
        for (uint256 i=0; i<tokens.length; i++) {
            if (tokens[i].tokenAddress == token) {
                isNewToken = false;
                require(tokens[i].amount >= amount, 'not enough token');
                tokens[i].amount -= amount;
                break;
            }
        }
        require(isNewToken == false, 'token is not exist');
    }
}