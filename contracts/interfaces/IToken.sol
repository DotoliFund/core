// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

interface IToken {
    struct Token {
        address token;
        uint256 amount;
    }
}
