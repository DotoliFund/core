// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol';
import './interfaces/IRouter.sol';

import './interfaces/IERC20Minimal.sol';
import './interfaces/IDotoliFund.sol';
import './interfaces/IDotoliFactory.sol';
import './base/Token.sol';

//TODO : remove console
import "hardhat/console.sol";

contract DotoliFund is Token, IDotoliFund {
    
    using Path for bytes;

    address public factory;
    address public weth9;
    address public router;
    address public override manager;

    // investor's tokens which is not deposited to uniswap v3 liquidity position
    mapping(address => Token[]) public investorTokens;
    // positionOwner[tokenId] => owner of uniswap v3 liquidity position
    mapping(uint256 => address) public positionOwner;
    // tokenIds[investor] => [ tokenId0, tokenId1, ... ]
    mapping(address => uint256[]) public tokenIds;
    // manager fee tokens
    Token[] public feeTokens;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        factory = msg.sender;
    }

    receive() external payable {
        if (msg.sender == weth9) {
            // when call IWETH9(weth9).withdraw(amount) in this contract, go into here.
        } else {
            bool isSubscribed = IDotoliFactory(factory).isSubscribed(msg.sender, address(this));
            require(isSubscribed, 'US');
            IWETH9(weth9).deposit{value: msg.value}();
            increaseToken(investorTokens[msg.sender], weth9, msg.value);
            emit Deposit(msg.sender, weth9, msg.value);
        }
    }

    function initialize(address _manager) override external {
        require(msg.sender == factory, 'FORBIDDEN');
        manager = _manager;
        router = IDotoliFactory(factory).router();
        weth9 = IDotoliFactory(factory).weth9();
        emit Initialize(address(this), _manager);
    }

    function _withdraw(address _token, uint256 _amount) private {
        if (_token == weth9) {
            IWETH9(weth9).withdraw(_amount);
            (bool success, ) = payable(msg.sender).call{value: _amount}(new bytes(0));
            require(success, 'FW');
        } else {
            IERC20Minimal(_token).transfer(msg.sender, _amount);
        }
    }

    function getInvestorTokens(address investor) external override view returns (Token[] memory) {
        return getTokens(investorTokens[investor]);
    }

    function getFeeTokens() external override view returns (Token[] memory) {
        return getTokens(feeTokens);
    }

    function getInvestorTokenAmount(address investor, address token) public override view returns (uint256) {
        return getTokenAmount(investorTokens[investor], token);
    }

    function getPositionTokenIds(address investor) external override view returns (uint256[] memory _tokenIds) {
        uint256[] memory _tokenIds = tokenIds[investor];
        return _tokenIds;
    }

    function feeIn(address investor, address token, uint256 amount) private {
        increaseToken(feeTokens, token, amount);
        emit ManagerFeeIn(investor, token, amount);
    }

    function feeOut(address token, uint256 amount) external payable override lock {
        require(msg.sender == manager, 'NM');

        bool isSuccess = decreaseToken(feeTokens, token, amount);
        if (isSuccess) {
            _withdraw(token, amount);
        }
        emit ManagerFeeOut(token, amount);
    }

    function deposit(address _token, uint256 _amount) external payable override lock {
        bool isSubscribed = IDotoliFactory(factory).isSubscribed(msg.sender, address(this));
        bool isWhiteListToken = IDotoliFactory(factory).whiteListTokens(_token);
        require(isSubscribed, 'US');
        require(isWhiteListToken, 'NWT');

        IERC20Minimal(_token).transferFrom(msg.sender, address(this), _amount);
        increaseToken(investorTokens[msg.sender], _token, _amount);
        emit Deposit(msg.sender, _token, _amount);
    }

    function withdraw(address _token, uint256 _amount) external payable override lock {
        bool isSubscribed = IDotoliFactory(factory).isSubscribed(msg.sender, address(this));
        uint256 tokenAmount = getTokenAmount(investorTokens[msg.sender], _token);
        require(isSubscribed, 'US');
        require(tokenAmount >= _amount, 'NET');

        decreaseToken(investorTokens[msg.sender], _token, _amount);

        uint256 feeAmount = 0;
        uint256 withdrawAmount = 0;
        uint256 managerFee = IDotoliFactory(factory).managerFee();
        if (msg.sender == manager) {
            // manager withdraw is no need manager fee
            feeAmount = 0;
            withdrawAmount = _amount;
            _withdraw(_token, _amount);
        } else {
            // send manager fee.
            feeAmount = _amount * managerFee / 10000 / 100;
            withdrawAmount = _amount - feeAmount;
            _withdraw(_token, withdrawAmount);
            feeIn(msg.sender, _token, feeAmount);
        }
        emit Withdraw(msg.sender, _token, withdrawAmount, feeAmount);
    }

    function handleSwap(
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        decreaseToken(investorTokens[investor], swapFrom, swapFromAmount);
        increaseToken(investorTokens[investor], swapTo, swapToAmount);
        emit Swap(investor, swapFrom, swapTo, swapFromAmount, swapToAmount);
    }

    function getLastTokenFromPath(bytes memory path) internal view returns (address) {
        address _tokenOut;

        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
                _tokenOut = tokenOut;
                break;
            }
        }
        return _tokenOut;
    }

    function swap(IRouter.SwapParams[] calldata trades) external payable override lock {
        require(msg.sender == manager, 'NM');

        for(uint256 i=0; i<trades.length; i++) {
            if (trades[i].swapType == IRouter.SwapType.EXACT_INPUT_SINGLE_HOP) {
                require(IDotoliFactory(factory).whiteListTokens(trades[i].tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(trades[i].amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(trades[i].tokenIn).approve(router, trades[i].amountIn);

                uint256 amountOut = IRouter(router).swapRouter(trades[i]);
                handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, trades[i].amountIn, amountOut);

            } else if (trades[i].swapType == IRouter.SwapType.EXACT_INPUT_MULTI_HOP) {
                address tokenOut = getLastTokenFromPath(trades[i].path);
                (address tokenIn, , ) = trades[i].path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, tokenIn);
                require(trades[i].amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(tokenIn).approve(router, trades[i].amountIn);

                uint256 amountOut = IRouter(router).swapRouter(trades[i]);
                handleSwap(trades[i].investor, tokenIn, tokenOut, trades[i].amountIn, amountOut);

            } else if (trades[i].swapType == IRouter.SwapType.EXACT_OUTPUT_SINGLE_HOP) {
                require(IDotoliFactory(factory).whiteListTokens(trades[i].tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(trades[i].amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(trades[i].tokenIn).approve(router, trades[i].amountInMaximum);

                uint256 amountIn = IRouter(router).swapRouter(trades[i]);
                handleSwap(trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, amountIn, trades[i].amountOut);

            } else if (trades[i].swapType == IRouter.SwapType.EXACT_OUTPUT_MULTI_HOP) {
                address tokenIn = getLastTokenFromPath(trades[i].path);
                (address tokenOut, , ) = trades[i].path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(trades[i].investor, tokenIn);
                require(trades[i].amountInMaximum <= tokenBalance, 'NET');

                uint256 amountIn = IRouter(router).swapRouter(trades[i]);
                handleSwap(trades[i].investor, tokenIn, tokenOut, amountIn, trades[i].amountOut);
            }
        }
    }

    function mintNewPosition(IRouter.MintParams calldata _params)
        external
        override
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        require(msg.sender == manager, 'NM');

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = getInvestorTokenAmount(_params.investor, _params.token0);
        uint256 token1Balance = getInvestorTokenAmount(_params.investor, _params.token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(_params.token0).approve(router, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(router, _params.amount1Desired);

        address token0;
        address token1;

        (tokenId, liquidity, token0, token1, amount0, amount1) = IRouter(router).mint(_params);

        decreaseToken(investorTokens[_params.investor], token0, amount0);
        decreaseToken(investorTokens[_params.investor], token1, amount1);

        positionOwner[tokenId] = _params.investor;
        tokenIds[_params.investor].push(tokenId);

        emit MintNewPosition(_params.investor, token0, token1, amount0, amount1);
    }

    function increaseLiquidity(IRouter.IncreaseParams calldata _params) 
        external override returns (uint128 liquidity, uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == manager, 'NM');
        require(_params.investor == positionOwner[_params.tokenId], 'NI');

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = getInvestorTokenAmount(_params.investor, _params.token0);
        uint256 token1Balance = getInvestorTokenAmount(_params.investor, _params.token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(_params.token0).approve(router, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(router, _params.amount1Desired);

        address token0;
        address token1;
        
        (liquidity, token0, token1, 
            amount0, amount1) = IRouter(router).increase(_params);

        decreaseToken(investorTokens[_params.investor], token0, amount0);
        decreaseToken(investorTokens[_params.investor], token1, amount1);

        emit IncreaseLiquidity(_params.investor, token0, token1, amount0, amount1);
    }

    function collectPositionFee(IRouter.CollectParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == positionOwner[_params.tokenId] || msg.sender == manager, 'NA');
        require(_params.investor == positionOwner[_params.tokenId], 'NI');

        address token0;
        address token1;
        
        (token0, token1, amount0, amount1) = IRouter(router).collect(_params);

        increaseToken(investorTokens[_params.investor], token0, amount0);
        increaseToken(investorTokens[_params.investor], token1, amount1);

        emit CollectPositionFee(_params.investor, token0, token1, amount0, amount1);
    }

    function decreaseLiquidity(IRouter.DecreaseParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == positionOwner[_params.tokenId] || msg.sender == manager, 'NA');
        require(_params.investor == positionOwner[_params.tokenId], 'NI');

        address token0;
        address token1;
        
        (token0, token1, amount0, amount1) = IRouter(router).decrease(_params);

        increaseToken(investorTokens[_params.investor], token0, amount0);
        increaseToken(investorTokens[_params.investor], token1, amount1);

        emit DecreaseLiquidity(_params.investor, token0, token1, amount0, amount1);
    }
}