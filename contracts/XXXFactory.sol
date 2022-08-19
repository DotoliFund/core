// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.8.4;
pragma abicoder v2;

import './interfaces/IXXXFactory.sol';
import './XXXFund.sol';

contract XXXFactory is IXXXFactory {
    address public override owner;
    // Uniswap v3 swapRouter
    address swapRouterAddress = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    uint256 managerFee = 1; // 1% of investor profit ex) MANAGER_FEE = 10 -> 10% of investor profit
    address[] whiteListTokens;

    /// @notice Emitted when the owner of the factory is changed
    /// @param oldOwner The owner before the owner was changed
    /// @param newOwner The owner after the owner was changed
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    mapping(address => address) public getFund;
    uint256 public fundCount;

    constructor() {
        owner = msg.sender;
        fundCount = 0;
        emit OwnerChanged(address(0), msg.sender);

        whiteListTokens.push(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2); //WETH
        whiteListTokens.push(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599); //WBTC
        whiteListTokens.push(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48); //USDC
        whiteListTokens.push(0x6B175474E89094C44Da98b954EedeAC495271d0F); //DAI
        whiteListTokens.push(0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984); //UNI
        whiteListTokens.push(0x64f0131a028293d160A172B29f10D8a457406a84); //XXX
    }

    function createFund(address manager) override external returns (address fund) {
        require(msg.sender == manager, 'XXXFactory: IDENTICAL_ADDRESSES');
        require(getFund[manager] == address(0), 'XXXFactory: FUND_EXISTS'); // single check is sufficient

        fund = address(new XXXFund{salt: keccak256(abi.encode(address(this), manager))}());
        getFund[manager] = fund;
        IXXXFund(fund).initialize(manager);
        fundCount += 1;

        emit Create(fund, manager);
    }

    function setOwner(address _owner) override external {
        require(msg.sender == owner);
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }

    function getSwapRouterAddress() override external returns (address) {
        return swapRouterAddress;
    }

    function setSwapRouterAddress(address _swapRouterAddress) override external {
        require(msg.sender == owner);
        swapRouterAddress = _swapRouterAddress;
    }

    function getManagerFee() override external returns (uint256) {
        return managerFee;
    }

    function setManagerFee(uint256 _managerFee) override external {
        require(msg.sender == owner);
        managerFee = _managerFee;
    }

    function isWhiteListToken(address _token) override public returns (bool) {
        for (uint256 i=0; i<whiteListTokens.length; i++) {
            if (whiteListTokens[i] == _token) {
                return true;
            }
        }
        return false;
    }

    function getWhiteListTokens() override public returns (address[] memory) {
        uint256 _whiteListTokenCount = whiteListTokens.length;
        address[] memory _whiteListTokens = new address[](_whiteListTokenCount);
        for (uint256 i; i<_whiteListTokenCount; i++) {
            _whiteListTokens[i] = whiteListTokens[i];
        }
        return _whiteListTokens;
    }

    function addWhiteListToken(address _token) override public {
        require(msg.sender == owner);
        if (!isWhiteListToken(_token)) {
            whiteListTokens.push(_token);
        }
    }

    function removeWhiteListToken(address _token) override public {
        require(msg.sender == owner);
        for (uint256 i=0; i<whiteListTokens.length; i++) {
            if (whiteListTokens[i] == _token) {
                whiteListTokens[i] = whiteListTokens[whiteListTokens.length - 1];
                whiteListTokens.pop();
            }
        }
    }
}