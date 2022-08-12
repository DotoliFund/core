// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.8.4;
pragma abicoder v2;

import './interfaces/IXXXFactory.sol';
import './XXXFund.sol';

contract XXXFactory is IXXXFactory {
    address public override owner;

    /// @notice Emitted when the owner of the factory is changed
    /// @param oldOwner The owner before the owner was changed
    /// @param newOwner The owner after the owner was changed
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    mapping(address => address) public getFund;
    uint256 public fundCount;

    event FundCreated(address manager, address fund, uint256 fundCount);

    constructor() {
        owner = msg.sender;
        fundCount = 0;
        emit OwnerChanged(address(0), msg.sender);
    }

    function createFund(address manager, address token, uint256 amount) override external returns (address fund) {
        require(msg.sender == manager, 'XXXFactory: IDENTICAL_ADDRESSES');
        require(getFund[manager] == address(0), 'XXXFactory: FUND_EXISTS'); // single check is sufficient

        fund = address(new XXXFund{salt: keccak256(abi.encode(address(this), manager))}());
        getFund[manager] = fund;
        IXXXFund(fund).initialize(manager, token, amount);
        fundCount += 1;

        emit FundCreated(manager, fund, fundCount);
    }

    function setOwner(address _owner) override external {
        require(msg.sender == owner);
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }
}