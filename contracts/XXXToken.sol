// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract XXXToken is ERC20, ERC20Permit, ERC20Votes {
    uint256 birthday;

    constructor() ERC20("XXXToken", "XXX") ERC20Permit("XXXToken") {
        birthday = block.timestamp;
        _mint(address(this),  9900000*1e18);
        _mint(msg.sender,      100000*1e18);
    }

    // The following functions are overrides required by Solidity.

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        // can't mint after 1 hours from deploy.
        require(block.timestamp < birthday + 1 hours); 
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }
}