# Dotoli core

This repository contains the core smart contracts for the Dotoli Protocol.

## Smart Contract

### DotoliFund
This contract interfaces with the `DotoliInfo`, `DotoliSetting`, `Uniswap V3` contract to manage fund managers and investors' ether or token assets. This contract holds actual Ethereum and token assets and records the transaction details and asset management details in the DotoliInfo contract as a ledger. When swapping, this contract exchange assets with the Uniswap V3 contract.

### DotoliInfo
This contract interfaces with the `DotoliFund` contract to save the ledger of ether or token assets of fund managers and investors.
It stores asset information for all fund managers and investors whenever a transaction is executed.

### DotoliSetting
This contract interfaces with the `DotoliFund` contract to save the setting value of DotoliFund like whitelist token condition and manager fee.

### LiquidityOracle
This contract calculates the amount of tokens in the Uniswap pool. Because if you know the amount of tokens, you know the `token price`. This contract is used in the `subgraph` of `The Graph` used by Dotoli.

## Contract Address

| Contract         | Mainnet Address | 
| ----------------------------------- | ---------------------------------------- | 
| [DotoliFund](https://github.com/DotoliFund/core/blob/master/contracts/DotoliFund.sol)                                                    | `0x5EA02ce75D173f03C88831893C69724C3F38df5e`           | 
| [DotoliInfo](https://github.com/DotoliFund/core/blob/master/contracts/DotoliInfo.sol)                                                                   | `0xD72008394f456362765446aD8638a0B0ee226d70`           | 
| [DotoliSetting](https://github.com/DotoliFund/core/blob/master/contracts/DotoliSetting.sol)                                   | `0x5E1cE0e492f956b4a1A1963E4A465256C060966c`           | 
| [LiquidityOracle](https://github.com/DotoliFund/core/blob/master/contracts/LiquidityOracle.sol)                                                          | `0xF21665FE164a37FE893f04F94704FF383Bd5Ed87`           | 


## Licensing

Inspired by Uniswap V3
```
GPL-2.0-or-later
```
