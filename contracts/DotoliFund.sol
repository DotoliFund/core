// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol';
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/IDotoliFactory.sol';
import './interfaces/IDotoliFund.sol';
import './interfaces/IDotoliInfo.sol';


contract DotoliFund is IDotoliFund {
    
    using Path for bytes;

    uint128 MAX_INT = 2**128 - 1;
    address public constant swapRouter = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address public constant nonfungiblePositionManager = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;

    address public factory;
    address public weth9;
    address public dotoliInfo;

    constructor(address _factory, address _weth9) {
        factory = _factory;
        weth9 = _weth9;
        dotoliInfo = address(new DotoliInfo{salt: keccak256(abi.encode(address(this), msg.sender))}());
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

        bool isSubscribed = IDotoliInfo(dotoliInfo).isSubscribed(msg.sender, fundId);
        require(isSubscribed, 'US');
        IWETH9(weth9).deposit{value: amount}();
        IDotoliInfo(dotoliInfo).increaseFundToken(fundId, weth9, amount);
        IDotoliInfo(dotoliInfo).increaseInvestorToken(fundId, msg.sender, weth9, amount);
        emit Deposit(fundId, msg.sender, weth9, amount);
    }

    receive() external payable {
        if (msg.sender == weth9) {
            // when call IWETH9(weth9).withdraw(amount) in this contract, go into here.
        } else {
            // when deposit ETH with no data
        }
    }

    function deposit(uint256 fundId, address _token, uint256 _amount) external override lock {
        bool isSubscribed = IDotoliInfo(dotoliInfo).isSubscribed(msg.sender, fundId);
        bool isWhiteListToken = IDotoliFactory(factory).whiteListTokens(_token);
        require(isSubscribed, 'US');
        require(isWhiteListToken, 'NWT');

        IERC20Minimal(_token).transferFrom(msg.sender, address(this), _amount);
        IDotoliInfo(dotoliInfo).increaseFundToken(fundId, _token, _amount);
        IDotoliInfo(dotoliInfo).increaseInvestorToken(fundId, msg.sender, _token, _amount);
        emit Deposit(fundId, msg.sender, _token, _amount);
    }

    function withdraw(uint256 fundId, address _token, uint256 _amount) external payable override lock {
        bool isSubscribed = IDotoliInfo(dotoliInfo).isSubscribed(msg.sender, fundId);
        uint256 tokenAmount = getTokenAmount(investorTokens[fundId][msg.sender], _token);
        require(isSubscribed, 'US');
        require(tokenAmount >= _amount, 'NET');

        // msg.sender is manager
        if (msg.sender == manager[fundId]) {
            if (_token == weth9) {
                IWETH9(weth9).withdraw(_amount);
                (bool success, ) = payable(msg.sender).call{value: _amount}(new bytes(0));
                require(success, 'FW');
            } else {
                IERC20Minimal(_token).transfer(msg.sender, _amount);
            }
            IDotoliInfo(dotoliInfo).decreaseFundToken(fundId, _token, _amount);
            IDotoliInfo(dotoliInfo).decreaseInvestorToken(fundId, msg.sender, _token, _amount);
            emit Withdraw(fundId, msg.sender, _token, _amount, 0);

        // msg.sender is investor
        } else {
            // deposit manager fee.
            uint256 managerFee = IDotoliFactory(factory).managerFee();
            uint256 feeAmount = _amount * managerFee / 10000 / 100;
            uint256 withdrawAmount = _amount - feeAmount;
            IDotoliInfo(dotoliInfo).decreaseFundToken(fundId, _token, withdrawAmount);

            if (_token == weth9) {
                IWETH9(weth9).withdraw(withdrawAmount);
                (bool success, ) = payable(msg.sender).call{value: withdrawAmount}(new bytes(0));
                require(success, 'FW');
            } else {
                IERC20Minimal(_token).transfer(msg.sender, withdrawAmount);
            }
            IDotoliInfo(dotoliInfo).decreaseInvestorToken(fundId, msg.sender, _token, _amount);
            emit Withdraw(fundId, msg.sender, _token, withdrawAmount, feeAmount);
            IDotoliInfo(dotoliInfo).increaseFeeToken(fundId, _token, feeAmount);
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
        IDotoliInfo(dotoliInfo).decreaseToken(fundId, swapFrom, swapFromAmount);
        IDotoliInfo(dotoliInfo).decreaseToken(fundId, investor, swapFrom, swapFromAmount);
        IDotoliInfo(dotoliInfo).increaseFundToken(fundId, swapTo, swapToAmount);
        IDotoliInfo(dotoliInfo).increaseInvestorToken(fundId, investor, swapTo, swapToAmount);
        emit Swap(fundId, investor, swapFrom, swapTo, swapFromAmount, swapToAmount);
    }

    function swap(uint256 fundId, address investor, SwapParams[] calldata trades) external payable override lock {
        require(fundId == IDotoliInfo(dotoliInfo).managingFund(msg.sender), 'NM');

        for(uint256 i=0; i<trades.length; i++) {

            if (trades[i].swapType == SwapType.EXACT_INPUT_SINGLE_HOP) 
            {
                require(IDotoliFactory(factory).whiteListTokens(trades[i].tokenOut), 'NWT');
                uint256 tokenBalance = IDotoliInfo(dotoliInfo).getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(trades[i].amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(trades[i].tokenIn).approve(swapRouter, trades[i].amountIn);

                ISwapRouter02.ExactInputSingleParams memory params =
                    IV3SwapRouter.ExactInputSingleParams({
                        tokenIn: trades[i].tokenIn,
                        tokenOut: trades[i].tokenOut,
                        fee: trades[i].fee,
                        recipient: address(this),
                        amountIn: trades[i].amountIn,
                        amountOutMinimum: trades[i].amountOutMinimum,
                        sqrtPriceLimitX96: 0
                    });
                uint256 amountOut = ISwapRouter02(swapRouter).exactInputSingle(params);
                
                handleSwap(fundId, trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, trades[i].amountIn, amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_INPUT_MULTI_HOP) 
            {
                address tokenOut = getLastTokenFromPath(trades[i].path);
                (address tokenIn, , ) = trades[i].path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = IDotoliInfo(dotoliInfo).getInvestorTokenAmount(trades[i].investor, tokenIn);
                require(trades[i].amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(tokenIn).approve(swapRouter, trades[i].amountIn);

                ISwapRouter02.ExactInputParams memory params =
                    IV3SwapRouter.ExactInputParams({
                        path: trades[i].path,
                        recipient: address(this),
                        amountIn: trades[i].amountIn,
                        amountOutMinimum: trades[i].amountOutMinimum
                    });
                uint256 amountOut = ISwapRouter02(swapRouter).exactInput(params);

                handleSwap(fundId, trades[i].investor, tokenIn, tokenOut, trades[i].amountIn, amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_SINGLE_HOP) 
            {
                require(IDotoliFactory(factory).whiteListTokens(trades[i].tokenOut), 'NWT');
                uint256 tokenBalance = IDotoliInfo(dotoliInfo).getInvestorTokenAmount(trades[i].investor, trades[i].tokenIn);
                require(trades[i].amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(trades[i].tokenIn).approve(swapRouter, trades[i].amountInMaximum);

                ISwapRouter02.ExactOutputSingleParams memory params =
                    IV3SwapRouter.ExactOutputSingleParams({
                        tokenIn: trades[i].tokenIn,
                        tokenOut: trades[i].tokenOut,
                        fee: trades[i].fee,
                        recipient: address(this),
                        amountOut: trades[i].amountOut,
                        amountInMaximum: trades[i].amountInMaximum,
                        sqrtPriceLimitX96: 0
                    });
                uint256 amountIn = ISwapRouter02(swapRouter).exactOutputSingle(params);

                // For exact output swaps, the amountInMaximum may not have all been spent.
                if (amountIn < trades[i].amountInMaximum) {
                    IERC20Minimal(trades[i].tokenIn).approve(swapRouter, 0);
                }

                handleSwap(fundId, trades[i].investor, trades[i].tokenIn, trades[i].tokenOut, amountIn, trades[i].amountOut);
            } 
            else if (trades[i].swapType == SwapType.EXACT_OUTPUT_MULTI_HOP) 
            {
                address tokenIn = getLastTokenFromPath(trades[i].path);
                (address tokenOut, , ) = trades[i].path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = IDotoliInfo(dotoliInfo).getInvestorTokenAmount(trades[i].investor, tokenIn);
                require(trades[i].amountInMaximum <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(tokenIn).approve(swapRouter, trades[i].amountInMaximum);

                ISwapRouter02.ExactOutputParams memory params =
                    IV3SwapRouter.ExactOutputParams({
                        path: trades[i].path,
                        recipient: address(this),
                        amountOut: trades[i].amountOut,
                        amountInMaximum: trades[i].amountInMaximum
                    });
                uint256 amountIn = ISwapRouter02(swapRouter).exactOutput(params);

                // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we approve the router to spend 0.
                if (amountIn < trades[i].amountInMaximum) {
                    IERC20Minimal(tokenIn).approve(swapRouter, 0);
                }

                handleSwap(fundId, trades[i].investor, tokenIn, tokenOut, amountIn, trades[i].amountOut);
            }
        }
    }

    function withdrawFee(uint256 fundId, address token, uint256 amount) external payable override {
        require(msg.sender == manager, 'NM');

        bool isSuccess = IDotoliInfo(dotoliInfo).decreaseFeeToken(fundId, token, amount);
        if (isSuccess) {
            if (token == weth9) {
                IWETH9(weth9).withdraw(amount);
                (bool success, ) = payable(msg.sender).call{value: amount}(new bytes(0));
                require(success, 'FW');
            } else {
                IERC20Minimal(token).transfer(msg.sender, amount);
            }
            decreaseFundToken(fundId, token, amount);
        }
        emit WithdrawFee(fundId, msg.sender, token, amount);
    }

    function mintNewPosition(MintParams calldata _params)
        external
        override
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        require(msg.sender == IDotoliInfo(dotoliInfo).manager(_params.fundId), 'NM');

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = IDotoliInfo(dotoliInfo).getInvestorTokenAmount(_params.fundId, _params.investor, _params.token0);
        uint256 token1Balance = IDotoliInfo(dotoliInfo).getInvestorTokenAmount(_params.fundId, _params.investor, _params.token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(_params.token0).approve(NonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(NonfungiblePositionManager, _params.amount1Desired);

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

        (tokenId, liquidity, amount0, amount1) = INonfungiblePositionManager(NonfungiblePositionManager).mint(params);

        IDotoliInfo(dotoliInfo).decreaseInvestorToken(_params.fundId, _params.investor, token0, amount0);
        IDotoliInfo(dotoliInfo).decreaseInvestorToken(_params.fundId, _params.investor, token1, amount1);

        (, , address token0, address token1, , , , , , , , ) 
            = INonfungiblePositionManager(NonfungiblePositionManager).positions(tokenId);

        positionOwner[tokenId] = _params.investor;
        tokenIds[_params.investor].push(tokenId);

        emit MintNewPosition(_params.fundId, _params.investor, token0, token1, amount0, amount1);
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata _params) 
        external override returns (uint128 liquidity, uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == IDotoliInfo(dotoliInfo).manager(_params.fundId), 'NM');
        require(_params.investor == IDotoliInfo(dotoliInfo).positionOwner(_params.tokenId), 'NI');

        (, , address token0, address token1, , , , , , , , ) 
            = INonfungiblePositionManager(NonfungiblePositionManager).positions(_params.tokenId);

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = IDotoliInfo(dotoliInfo).getInvestorTokenAmount(_params.fundId, _params.investor, token0);
        uint256 token1Balance = IDotoliInfo(dotoliInfo).getInvestorTokenAmount(_params.fundId, _params.investor, token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(token0).approve(NonfungiblePositionManager, _params.amount0Desired);
        IERC20Minimal(token1).approve(NonfungiblePositionManager, _params.amount1Desired);

        INonfungiblePositionManager.IncreaseLiquidityParams memory params =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: _params.tokenId,
                amount0Desired: _params.amount0Desired,
                amount1Desired: _params.amount1Desired,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(NonfungiblePositionManager).increaseLiquidity(params);

        IDotoliInfo(dotoliInfo).decreaseInvestorToken(_params.fundId, _params.investor, token0, amount0);
        IDotoliInfo(dotoliInfo).decreaseInvestorToken(_params.fundId, _params.investor, token1, amount1);

        emit IncreaseLiquidity(_params.fundId, _params.investor, token0, token1, amount0, amount1);
    }

    function collectPositionFee(CollectFeeParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == positionOwner[_params.tokenId] || msg.sender == manager, 'NA');
        require(_params.investor == positionOwner[_params.tokenId], 'NI');

        INonfungiblePositionManager.CollectParams memory params =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: address(this),
                amount0Max: _params.amount0Max,
                amount1Max: _params.amount1Max
            });
        (amount0, amount1) = INonfungiblePositionManager(NonfungiblePositionManager).collect(params);

        (, , address token0, address token1, , , , , , , , ) 
            = INonfungiblePositionManager(NonfungiblePositionManager).positions(_params.tokenId);

        IDotoliInfo(dotoliInfo).increaseInvestorToken(_params.fundId, _params.investor, token0, amount0);
        IDotoliInfo(dotoliInfo).increaseInvestorToken(_params.fundId, _params.investor, token1, amount1);

        emit CollectPositionFee(_params.fundId, _params.investor, token0, token1, amount0, amount1);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == positionOwner[_params.tokenId] || msg.sender == manager, 'NA');
        require(_params.investor == positionOwner[_params.tokenId], 'NI');

        INonfungiblePositionManager.DecreaseLiquidityParams memory params =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: _params.tokenId,
                liquidity: _params.liquidity,
                amount0Min: _params.amount0Min,
                amount1Min: _params.amount1Min,
                deadline: _params.deadline
            });
        INonfungiblePositionManager(NonfungiblePositionManager).decreaseLiquidity(params);

        INonfungiblePositionManager.CollectParams memory collectParams =
            INonfungiblePositionManager.CollectParams({
                tokenId: _params.tokenId,
                recipient: address(this),
                amount0Max: MAX_INT,
                amount1Max: MAX_INT
            });
        (amount0, amount1) = INonfungiblePositionManager(NonfungiblePositionManager).collect(collectParams);

        (, , address token0, address token1, , , , , , , , ) 
            = INonfungiblePositionManager(NonfungiblePositionManager).positions(_params.tokenId);

        IDotoliInfo(dotoliInfo).increaseInvestorToken(_params.fundId, _params.investor, token0, amount0);
        IDotoliInfo(dotoliInfo).increaseInvestorToken(_params.fundId, _params.investor, token1, amount1);

        emit DecreaseLiquidity(_params.fundId, _params.investor, token0, token1, amount0, amount1);
    }
}