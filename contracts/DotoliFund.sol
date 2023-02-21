// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/IDotoliSetting.sol';
import './interfaces/IDotoliFund.sol';
import './interfaces/IDotoliInfo.sol';


contract DotoliFund is IDotoliFund {
    
    using Path for bytes;

    uint128 MAX_INT = 2**128 - 1;
    address public constant swapRouter = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address public constant nonfungiblePositionManager = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;

    address public weth9;
    address public setting;
    address public info;

    modifier onlyManager(address sender, uint256 fundId) {
        require(fundId == IDotoliInfo(info).managingFund(sender), 'NM');
        _;
    }

    modifier onlyManagerOrInvestor(address sender, uint256 fundId, uint256 tokenId) {
        require(fundId == IDotoliInfo(info).managingFund(sender) ||
            sender == IDotoliInfo(info).tokenIdOwner(tokenId), 'NA');
        _;
    }

    constructor(address _weth9, address _setting, address _info) {
        weth9 = _weth9;
        setting = _setting;
        info = _info;
    }

    function decode(bytes memory data) private pure returns (bytes32 result) {
        assembly {
          // load 32 bytes into `selector` from `data` skipping the first 32 bytes
          result := mload(add(data, 32))
        }
    }

    fallback() external payable { 
        // when deposit ETH with data
        uint256 amount = msg.value;
        uint256 length = msg.data.length;
        (bytes32 byteData) = decode(msg.data);

        // bytes32 -> uint256
        uint256 converted = 0;
        for (uint256 i=0; i<length; i++) {
            converted += uint8(byteData[i]) * (256 ** (length-i-1));
        }
        uint256 fundId = converted;

        bool isSubscribed = IDotoliInfo(info).isSubscribed(msg.sender, fundId);
        require(isSubscribed, 'US');
        IWETH9(weth9).deposit{value: amount}();
        IDotoliInfo(info).increaseFundToken(fundId, weth9, amount);
        IDotoliInfo(info).increaseInvestorToken(fundId, msg.sender, weth9, amount);
        emit Deposit(fundId, msg.sender, weth9, amount);
    }

    receive() external payable {
        if (msg.sender == weth9) {
            // when call IWETH9(weth9).withdraw(amount) in this contract, go into here.
        } else {
            // when deposit ETH with no data
        }
    }

    function deposit(uint256 fundId, address _token, uint256 _amount) external override {
        bool isSubscribed = IDotoliInfo(info).isSubscribed(msg.sender, fundId);
        bool isWhiteListToken = IDotoliSetting(setting).whiteListTokens(_token);
        require(isSubscribed, 'US');
        require(isWhiteListToken, 'NWT');

        IERC20Minimal(_token).transferFrom(msg.sender, address(this), _amount);
        IDotoliInfo(info).increaseFundToken(fundId, _token, _amount);
        IDotoliInfo(info).increaseInvestorToken(fundId, msg.sender, _token, _amount);
        emit Deposit(fundId, msg.sender, _token, _amount);
    }

    function withdraw(uint256 fundId, address _token, uint256 _amount) external payable override {
        bool isSubscribed = IDotoliInfo(info).isSubscribed(msg.sender, fundId);
        uint256 tokenAmount = IDotoliInfo(info).getInvestorTokenAmount(fundId, msg.sender, _token);
        require(isSubscribed, 'US');
        require(tokenAmount >= _amount, 'NET');

        // msg.sender is manager
        if (msg.sender == IDotoliInfo(info).manager(fundId)) {
            if (_token == weth9) {
                IWETH9(weth9).withdraw(_amount);
                (bool success, ) = payable(msg.sender).call{value: _amount}(new bytes(0));
                require(success, 'FW');
            } else {
                IERC20Minimal(_token).transfer(msg.sender, _amount);
            }
            IDotoliInfo(info).decreaseFundToken(fundId, _token, _amount);
            IDotoliInfo(info).decreaseInvestorToken(fundId, msg.sender, _token, _amount);
            emit Withdraw(fundId, msg.sender, _token, _amount, 0);

        // msg.sender is investor
        } else {
            // deposit manager fee.
            uint256 managerFee = IDotoliSetting(setting).managerFee();
            uint256 feeAmount = _amount * managerFee / 10000 / 100;
            uint256 withdrawAmount = _amount - feeAmount;
            IDotoliInfo(info).decreaseFundToken(fundId, _token, withdrawAmount);

            if (_token == weth9) {
                IWETH9(weth9).withdraw(withdrawAmount);
                (bool success, ) = payable(msg.sender).call{value: withdrawAmount}(new bytes(0));
                require(success, 'FW');
            } else {
                IERC20Minimal(_token).transfer(msg.sender, withdrawAmount);
            }
            IDotoliInfo(info).decreaseInvestorToken(fundId, msg.sender, _token, _amount);
            emit Withdraw(fundId, msg.sender, _token, withdrawAmount, feeAmount);
            IDotoliInfo(info).increaseFeeToken(fundId, _token, feeAmount);
            emit DepositFee(fundId, msg.sender, _token, feeAmount);
        }
    }

    function handleSwap(
        uint256 fundId,
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        IDotoliInfo(info).decreaseFundToken(fundId, swapFrom, swapFromAmount);
        IDotoliInfo(info).decreaseInvestorToken(fundId, investor, swapFrom, swapFromAmount);
        IDotoliInfo(info).increaseFundToken(fundId, swapTo, swapToAmount);
        IDotoliInfo(info).increaseInvestorToken(fundId, investor, swapTo, swapToAmount);
        emit Swap(fundId, investor, swapFrom, swapTo, swapFromAmount, swapToAmount);
    }

    function getLastTokenFromPath(bytes memory path) private view returns (address) {
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

    function exactInputSingle(uint256 fundId, address investor, SwapParams calldata trade) private {
        require(IDotoliSetting(setting).whiteListTokens(trade.tokenOut), 'NWT');
        uint256 tokenBalance = IDotoliInfo(info).getInvestorTokenAmount(fundId, investor, trade.tokenIn);
        require(trade.amountIn <= tokenBalance, 'NET');

        // approve
        IERC20Minimal(trade.tokenIn).approve(swapRouter, trade.amountIn);

        ISwapRouter02.ExactInputSingleParams memory params =
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: trade.tokenIn,
                tokenOut: trade.tokenOut,
                fee: trade.fee,
                recipient: address(this),
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum,
                sqrtPriceLimitX96: 0
            });
        uint256 amountOut = ISwapRouter02(swapRouter).exactInputSingle(params);
        
        handleSwap(fundId, investor, trade.tokenIn, trade.tokenOut, trade.amountIn, amountOut);
    }

    function exactInput(uint256 fundId, address investor, SwapParams calldata trade) private {
        address tokenOut = getLastTokenFromPath(trade.path);
        (address tokenIn, , ) = trade.path.decodeFirstPool();
        require(IDotoliSetting(setting).whiteListTokens(tokenOut), 'NWT');
        uint256 tokenBalance = IDotoliInfo(info).getInvestorTokenAmount(fundId, investor, tokenIn);
        require(trade.amountIn <= tokenBalance, 'NET');

        // approve
        IERC20Minimal(tokenIn).approve(swapRouter, trade.amountIn);

        ISwapRouter02.ExactInputParams memory params =
            IV3SwapRouter.ExactInputParams({
                path: trade.path,
                recipient: address(this),
                amountIn: trade.amountIn,
                amountOutMinimum: trade.amountOutMinimum
            });
        uint256 amountOut = ISwapRouter02(swapRouter).exactInput(params);

        handleSwap(fundId, investor, tokenIn, tokenOut, trade.amountIn, amountOut);
    }

    function exactOutputSingle(uint256 fundId, address investor, SwapParams calldata trade) private {
        require(IDotoliSetting(setting).whiteListTokens(trade.tokenOut), 'NWT');
        uint256 tokenBalance = IDotoliInfo(info).getInvestorTokenAmount(fundId, investor, trade.tokenIn);
        require(trade.amountIn <= tokenBalance, 'NET');

        // approve
        IERC20Minimal(trade.tokenIn).approve(swapRouter, trade.amountInMaximum);

        ISwapRouter02.ExactOutputSingleParams memory params =
            IV3SwapRouter.ExactOutputSingleParams({
                tokenIn: trade.tokenIn,
                tokenOut: trade.tokenOut,
                fee: trade.fee,
                recipient: address(this),
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum,
                sqrtPriceLimitX96: 0
            });
        uint256 amountIn = ISwapRouter02(swapRouter).exactOutputSingle(params);

        // For exact output swaps, the amountInMaximum may not have all been spent.
        if (amountIn < trade.amountInMaximum) {
            IERC20Minimal(trade.tokenIn).approve(swapRouter, 0);
        }

        handleSwap(fundId, investor, trade.tokenIn, trade.tokenOut, amountIn, trade.amountOut);
    }

    function exactOutput(uint256 fundId, address investor, SwapParams calldata trade) private {
        address tokenIn = getLastTokenFromPath(trade.path);
        (address tokenOut, , ) = trade.path.decodeFirstPool();
        require(IDotoliSetting(setting).whiteListTokens(tokenOut), 'NWT');
        uint256 tokenBalance = IDotoliInfo(info).getInvestorTokenAmount(fundId, investor, tokenIn);
        require(trade.amountInMaximum <= tokenBalance, 'NET');

        // approve
        IERC20Minimal(tokenIn).approve(swapRouter, trade.amountInMaximum);

        ISwapRouter02.ExactOutputParams memory params =
            IV3SwapRouter.ExactOutputParams({
                path: trade.path,
                recipient: address(this),
                amountOut: trade.amountOut,
                amountInMaximum: trade.amountInMaximum
            });
        uint256 amountIn = ISwapRouter02(swapRouter).exactOutput(params);

        // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we approve the router to spend 0.
        if (amountIn < trade.amountInMaximum) {
            IERC20Minimal(tokenIn).approve(swapRouter, 0);
        }

        handleSwap(fundId, investor, tokenIn, tokenOut, amountIn, trade.amountOut);
    }

    function swap(uint256 fundId, address investor, SwapParams[] calldata trades) 
        external override onlyManager(msg.sender, fundId)
    {
        for(uint256 i=0; i<trades.length; i++)
        {
            if (trades[i].swapType == SwapType.EXACT_INPUT_SINGLE_HOP) 
            {
                exactInputSingle(fundId, investor, trades[i]);
            } 
            else if (trades[i].swapType == SwapType.EXACT_INPUT_MULTI_HOP) 
            {
                exactInput(fundId, investor, trades[i]);
            } 
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_SINGLE_HOP) 
            {
                exactOutputSingle(fundId, investor, trades[i]);
            }
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_MULTI_HOP) 
            {
                exactOutput(fundId, investor, trades[i]);
            }
        }
    }

    function withdrawFee(uint256 fundId, address token, uint256 amount) 
        external payable override onlyManager(msg.sender, fundId)
    {
        bool isSuccess = IDotoliInfo(info).decreaseFeeToken(fundId, token, amount);
        if (isSuccess) {
            if (token == weth9) {
                IWETH9(weth9).withdraw(amount);
                (bool success, ) = payable(msg.sender).call{value: amount}(new bytes(0));
                require(success, 'FW');
            } else {
                IERC20Minimal(token).transfer(msg.sender, amount);
            }
            IDotoliInfo(info).decreaseFundToken(fundId, token, amount);
        }
        emit WithdrawFee(fundId, msg.sender, token, amount);
    }

    function checkForAddLiquidity(
        uint256 fundId,
        address investor,
        address token0,
        address token1,
        uint256 amount0Desired,
        uint256 amount1Desired
    ) private view {
        bool isToken0WhiteListToken = IDotoliSetting(setting).whiteListTokens(token0);
        bool isToken1WhiteListToken = IDotoliSetting(setting).whiteListTokens(token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = IDotoliInfo(info).getInvestorTokenAmount(fundId, investor, token0);
        uint256 token1Balance = IDotoliInfo(info).getInvestorTokenAmount(fundId, investor, token1);
        require(amount0Desired <= token0Balance, 'NET0');
        require(amount1Desired <= token1Balance, 'NET1');
    }

    function mintNewPosition(uint256 fundId, address investor, MintParams calldata _params)
        external
        override
        onlyManager(msg.sender, fundId)
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        checkForAddLiquidity(fundId, investor, _params.token0, 
            _params.token1, _params.amount0Desired, _params.amount1Desired);

        IERC20Minimal(_params.token0).approve(nonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(nonfungiblePositionManager, _params.amount1Desired);

        INonfungiblePositionManager.MintParams memory params =
            INonfungiblePositionManager.MintParams({
                token0: _params.token0,
                token1: _params.token1,
                fee: _params.fee,
                tickLower: _params.tickLower,
                tickUpper: _params.tickUpper,
                amount0Desired: _params.amount0Desired,
                amount1Desired: _params.amount1Desired,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                recipient: address(this),
                deadline: _params.deadline
            });

        (tokenId, liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).mint(params);

        (, , address token0, address token1, , , , , , , , ) 
            = INonfungiblePositionManager(nonfungiblePositionManager).positions(tokenId);

        IDotoliInfo(info).decreaseInvestorToken(fundId, investor, token0, amount0);
        IDotoliInfo(info).decreaseInvestorToken(fundId, investor, token1, amount1);

        IDotoliInfo(info).addTokenId(fundId, investor, tokenId);

        emit MintNewPosition(fundId, investor, token0, token1, amount0, amount1);
    }

    function increaseLiquidity(uint256 fundId, address investor, IncreaseLiquidityParams calldata _params) 
        external
        override
        onlyManager(msg.sender, fundId)
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        ) 
    {
        require(investor == IDotoliInfo(info).tokenIdOwner(_params.tokenId), 'INVALID');

        (, , address token0, address token1, , , , , , , , ) 
            = INonfungiblePositionManager(nonfungiblePositionManager).positions(_params.tokenId);

        checkForAddLiquidity(fundId, investor, token0, token1, _params.amount0Desired, _params.amount1Desired);

        IERC20Minimal(token0).approve(nonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(token1).approve(nonfungiblePositionManager, _params.amount1Desired);

        INonfungiblePositionManager.IncreaseLiquidityParams memory params =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: _params.tokenId,
                amount0Desired: _params.amount0Desired,
                amount1Desired: _params.amount1Desired,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).increaseLiquidity(params);

        IDotoliInfo(info).decreaseInvestorToken(fundId, investor, token0, amount0);
        IDotoliInfo(info).decreaseInvestorToken(fundId, investor, token1, amount1);

        emit IncreaseLiquidity(fundId, investor, token0, token1, amount0, amount1);
    }

    function collectPositionFee(uint256 fundId, address investor, CollectParams calldata _params) 
        external
        override
        onlyManagerOrInvestor(msg.sender, fundId, _params.tokenId)
        returns (
            uint256 amount0,
            uint256 amount1
        ) 
    {
        require(investor == IDotoliInfo(info).tokenIdOwner(_params.tokenId), 'INVALID');

        INonfungiblePositionManager.CollectParams memory params =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: address(this),
                amount0Max: _params.amount0Max,
                amount1Max: _params.amount1Max
            });
        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).collect(params);

        (, , address token0, address token1, , , , , , , , ) 
            = INonfungiblePositionManager(nonfungiblePositionManager).positions(_params.tokenId);

        IDotoliInfo(info).increaseInvestorToken(fundId, investor, token0, amount0);
        IDotoliInfo(info).increaseInvestorToken(fundId, investor, token1, amount1);

        emit CollectPositionFee(fundId, investor, token0, token1, amount0, amount1);
    }

    function decreaseLiquidity(uint256 fundId, address investor, DecreaseLiquidityParams calldata _params) 
        external
        override
        onlyManagerOrInvestor(msg.sender, fundId, _params.tokenId)
        returns (
            uint256 amount0,
            uint256 amount1
        ) 
    {
        require(investor == IDotoliInfo(info).tokenIdOwner(_params.tokenId), 'INVALID');

        INonfungiblePositionManager.DecreaseLiquidityParams memory params =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: _params.tokenId,
                liquidity: _params.liquidity,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });
        INonfungiblePositionManager(nonfungiblePositionManager).decreaseLiquidity(params);

        INonfungiblePositionManager.CollectParams memory collectParams =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: address(this),
                amount0Max: MAX_INT,
                amount1Max: MAX_INT
            });
        (amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).collect(collectParams);

        (, , address token0, address token1, , , , , , , , ) 
            = INonfungiblePositionManager(nonfungiblePositionManager).positions(_params.tokenId);

        IDotoliInfo(info).increaseInvestorToken(fundId, investor, token0, amount0);
        IDotoliInfo(info).increaseInvestorToken(fundId, investor, token1, amount1);

        emit DecreaseLiquidity(fundId, investor, token0, token1, amount0, amount1);
    }
}