// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

//TODO : change testnet WETH, USDC
abstract contract Constants {
    // Uniswap v3
    address UNISWAP_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    address SwapRouterAddress = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address NonfungiblePositionManager = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;

    uint128 MAX_INT = 2**128 - 1;
}