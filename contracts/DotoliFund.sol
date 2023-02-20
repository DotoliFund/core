// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol';
import './base/Token.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/ISwapRouter.sol';
import './interfaces/ILiquidityRouter.sol';
import './interfaces/IDotoliFactory.sol';
import './interfaces/IDotoliFund.sol';


contract DotoliFund is Token, IDotoliFund {
    
    using Path for bytes;

    address public factory;
    address public weth9;
    address public swapRouter;
    address public liquidityRouter;

    uint256 public fundIdCount = 0;

    mapping(address => uint256) public managingFund;                        // managingFund[manager]
    mapping(address => mapping(uint256 => uint256)) public investingFunds;  // investingFunds[investor]
    mapping(address => uint256) public investingFundCount;

    mapping(uint256 => address) public manager;                             // manager[fundId]
    mapping(uint256 => Token[]) public fundTokens;                          // fundTokens[fundId]
    mapping(uint256 => Token[]) public feeTokens;                           // feeTokens[fundId]
    mapping(uint256 => mapping(address => Token[])) public investorTokens;  // investorTokens[fundId][investor]
    mapping(uint256 => mapping(address => uint256[])) public tokenIds;      // tokenIds[fundId][investor]
    mapping(uint256 => address) public tokenIdOwner;                        // tokenIdOwner[tokenId] => owner of uniswap v3 liquidity position
    mapping(uint256 => uint256) public investorCount;                       // investorCount[fundId]

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address _factory, address _weth9, address _swapRouter, address _liquidityRouter) {
        factory = _factory;
        weth9 = _weth9;
        swapRouter = _swapRouter;
        liquidityRouter = _liquidityRouter;
    }

    function getFundTokens(uint256 fundId) external override view returns (Token[] memory) {
        return fundTokens[fundId];
    }

    function getInvestorTokens(uint256 fundId, address investor) external override view returns (Token[] memory) {
        return investorTokens[fundId][investor];
    }

    function getFeeTokens(uint256 fundId) external override view returns (Token[] memory) {
        return feeTokens[fundId];
    }

    function getFundTokenAmount(uint256 fundId, address token) public override view returns (uint256) {
        return getTokenAmount(fundTokens[fundId], token);
    }

    function getInvestorTokenAmount(uint256 fundId, address investor, address token) public override view returns (uint256) {
        return getTokenAmount(investorTokens[fundId][investor], token);
    }

    function getTokenIds(uint256 fundId, address investor) external override view returns (uint256[] memory _tokenIds) {
        _tokenIds = tokenIds[fundId][investor];
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

        require(isSubscribed(msg.sender, fundId), 'US');
        IWETH9(weth9).deposit{value: amount}();
        increaseToken(fundTokens[fundId], weth9, amount);
        increaseToken(investorTokens[fundId][msg.sender], weth9, amount);
        emit Deposit(fundId, msg.sender, weth9, amount);
    }

    receive() external payable {
        if (msg.sender == weth9) {
            // when call IWETH9(weth9).withdraw(amount) in this contract, go into here.
        } else {
            // when deposit ETH with no data
        }
    }

    function createFund() external override lock returns (uint256 fundId) {
        require(managingFund[msg.sender] == 0, 'EXISTS');
        fundId = ++fundIdCount;
        managingFund[msg.sender] = fundId;
        uint256 fundCount = investingFundCount[msg.sender];
        investingFunds[msg.sender][fundCount] = fundId;
        investingFundCount[msg.sender] += 1;
        manager[fundId] = msg.sender;
        emit FundCreated(fundId, msg.sender);
    }

    function isSubscribed(address investor, uint256 fundId) public override view returns (bool) {
        uint256 fundCount = investingFundCount[investor];
        for (uint256 i=0; i<fundCount; i++) {
            if (fundId == investingFunds[investor][i]) {
                return true;
            }
        }
        return false;
    }

    function subscribedFunds(address investor) external override view returns (uint256[] memory){
        uint256 fundCount = investingFundCount[investor];
        uint256[] memory fundIds;
        fundIds = new uint256[](fundCount);
        for (uint256 i=0; i<fundCount; i++) {
            fundIds[i] = investingFunds[investor][i];
        }
        return fundIds;
    }

    function subscribe(uint256 fundId) external override lock {
        require(!isSubscribed(msg.sender, fundId), 'AR');
        uint256 fundCount = investingFundCount[msg.sender];
        investingFunds[msg.sender][fundCount] = fundId;
        investingFundCount[msg.sender] += 1;
        investorCount[fundId] += 1;
        emit Subscribe(fundId, msg.sender);
    }

    function deposit(uint256 fundId, address _token, uint256 _amount) external override lock {
        bool isWhiteListToken = IDotoliFactory(factory).whiteListTokens(_token);
        require(isSubscribed(msg.sender, fundId), 'US');
        require(isWhiteListToken, 'NWT');

        IERC20Minimal(_token).transferFrom(msg.sender, address(this), _amount);
        increaseToken(fundTokens[fundId], _token, _amount);
        increaseToken(investorTokens[fundId][msg.sender], _token, _amount);
        emit Deposit(fundId, msg.sender, _token, _amount);
    }

    function withdraw(uint256 fundId, address _token, uint256 _amount) external payable override lock {
        uint256 tokenAmount = getTokenAmount(investorTokens[fundId][msg.sender], _token);
        require(isSubscribed(msg.sender, fundId), 'US');
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
            decreaseToken(fundTokens[fundId], _token, _amount);
            decreaseToken(investorTokens[fundId][msg.sender], _token, _amount);
            emit Withdraw(fundId, msg.sender, _token, _amount, 0);

        // msg.sender is investor
        } else {
            // deposit manager fee.
            uint256 managerFee = IDotoliFactory(factory).managerFee();
            uint256 feeAmount = _amount * managerFee / 10000 / 100;
            uint256 withdrawAmount = _amount - feeAmount;
            decreaseToken(fundTokens[fundId], _token, withdrawAmount);

            if (_token == weth9) {
                IWETH9(weth9).withdraw(withdrawAmount);
                (bool success, ) = payable(msg.sender).call{value: withdrawAmount}(new bytes(0));
                require(success, 'FW');
            } else {
                IERC20Minimal(_token).transfer(msg.sender, withdrawAmount);
            }
            decreaseToken(investorTokens[fundId][msg.sender], _token, _amount);
            emit Withdraw(fundId, msg.sender, _token, withdrawAmount, feeAmount);
            increaseToken(feeTokens[fundId], _token, feeAmount);
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
        decreaseToken(fundTokens[fundId], swapFrom, swapFromAmount);
        decreaseToken(investorTokens[fundId][investor], swapFrom, swapFromAmount);
        increaseToken(fundTokens[fundId], swapTo, swapToAmount);
        increaseToken(investorTokens[fundId][investor], swapTo, swapToAmount);
        emit Swap(fundId, investor, swapFrom, swapTo, swapFromAmount, swapToAmount);
    }

    function swap(uint256 fundId, address investor, ISwapRouter.SwapParams[] calldata trades) external override lock {
        for(uint256 i=0; i<trades.length; i++) {
            ISwapRouter.SwapParams memory param = trades[i];
            require(msg.sender == manager[fundId], 'NM');

            //exact input single
            if (param.swapType == ISwapRouter.SwapType.EXACT_INPUT_SINGLE_HOP) {
                require(IDotoliFactory(factory).whiteListTokens(param.tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(fundId, investor, param.tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(param.tokenIn).approve(swapRouter, param.amountIn);

                uint256 amountOut = ISwapRouter(swapRouter).swapRouter(param);
                handleSwap(fundId, investor, param.tokenIn, param.tokenOut, param.amountIn, amountOut);

            //exact input 
            } else if (param.swapType == ISwapRouter.SwapType.EXACT_INPUT_MULTI_HOP) {
                address tokenOut = ISwapRouter(swapRouter).getLastTokenFromPath(param.path);
                (address tokenIn, , ) = param.path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(fundId, investor, tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(tokenIn).approve(swapRouter, param.amountIn);

                uint256 amountOut = ISwapRouter(swapRouter).swapRouter(param);
                handleSwap(fundId, investor, tokenIn, tokenOut, param.amountIn, amountOut);

            //exact output single
            } else if (param.swapType == ISwapRouter.SwapType.EXACT_OUTPUT_SINGLE_HOP) {
                require(IDotoliFactory(factory).whiteListTokens(param.tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(fundId, investor, param.tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(param.tokenIn).approve(swapRouter, param.amountInMaximum);

                uint256 amountIn = ISwapRouter(swapRouter).swapRouter(param);
                handleSwap(fundId, investor, param.tokenIn, param.tokenOut, amountIn, param.amountOut);
            
            //exact output
            } else if (param.swapType == ISwapRouter.SwapType.EXACT_OUTPUT_MULTI_HOP) {
                address tokenIn = ISwapRouter(swapRouter).getLastTokenFromPath(param.path);
                (address tokenOut, , ) = param.path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(fundId, investor, tokenIn);
                require(param.amountInMaximum <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(tokenIn).approve(swapRouter, param.amountInMaximum);

                uint256 amountIn = ISwapRouter(swapRouter).swapRouter(param);
                handleSwap(fundId, investor, tokenIn, tokenOut, amountIn, param.amountOut);
            }
        }
    }

    function withdrawFee(uint256 fundId, address token, uint256 amount) external payable override lock {
        require(msg.sender == manager[fundId], 'NM');
        bool isSuccess = decreaseToken(feeTokens[fundId], token, amount);
        if (isSuccess) {
            if (token == weth9) {
                IWETH9(weth9).withdraw(amount);
                (bool success, ) = payable(msg.sender).call{value: amount}(new bytes(0));
                require(success, 'FW');
            } else {
                IERC20Minimal(token).transfer(msg.sender, amount);
            }
            decreaseToken(fundTokens[fundId], token, amount);
        }
        emit WithdrawFee(fundId, msg.sender, token, amount);
    }

    function mintNewPosition(ILiquidityRouter.MintParams calldata _params) external override lock returns (
        uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(msg.sender == manager[_params.fundId], 'NM');

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = getInvestorTokenAmount(_params.fundId, _params.investor, _params.token0);
        uint256 token1Balance = getInvestorTokenAmount(_params.fundId, _params.investor, _params.token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(_params.token0).approve(liquidityRouter, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(liquidityRouter, _params.amount1Desired);

        (tokenId, liquidity, amount0, amount1) = ILiquidityRouter(liquidityRouter).mint(_params);

        (address token0, address token1) = ILiquidityRouter(liquidityRouter).getLiquidityToken(tokenId);
        decreaseToken(fundTokens[_params.fundId], token0, amount0);
        decreaseToken(fundTokens[_params.fundId], token1, amount1);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        tokenIdOwner[tokenId] = _params.investor;
        tokenIds[_params.fundId][_params.investor].push(tokenId);

        emit MintNewPosition(_params.fundId, _params.investor, token0, token1, amount0, amount1);
    }

    function increaseLiquidity(ILiquidityRouter.IncreaseParams calldata _params) 
        external override lock returns (uint128 liquidity, uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == manager[_params.fundId], 'NM');
        require(_params.investor == tokenIdOwner[_params.tokenId], 'NI');

        (address token0, address token1) = ILiquidityRouter(liquidityRouter).getLiquidityToken(_params.tokenId);

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = getInvestorTokenAmount(_params.fundId, _params.investor, token0);
        uint256 token1Balance = getInvestorTokenAmount(_params.fundId, _params.investor, token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(token0).approve(liquidityRouter, _params.amount0Desired);
        IERC20Minimal(token1).approve(liquidityRouter, _params.amount1Desired);
        
        (liquidity, amount0, amount1) = ILiquidityRouter(liquidityRouter).increase(_params);

        decreaseToken(fundTokens[_params.fundId], token0, amount0);
        decreaseToken(fundTokens[_params.fundId], token1, amount1);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit IncreaseLiquidity(_params.fundId, _params.investor, token0, token1, amount0, amount1);
    }

    function collectPositionFee(ILiquidityRouter.CollectParams calldata _params) 
        external override lock returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == tokenIdOwner[_params.tokenId] || msg.sender == manager[_params.fundId], 'NA');
        require(_params.investor == tokenIdOwner[_params.tokenId], 'NI');
        
        (amount0, amount1) = ILiquidityRouter(liquidityRouter).collect(_params);

        (address token0, address token1) = ILiquidityRouter(liquidityRouter).getLiquidityToken(_params.tokenId);
        increaseToken(fundTokens[_params.fundId], token0, amount0);
        increaseToken(fundTokens[_params.fundId], token1, amount1);
        increaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        increaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit CollectPositionFee(_params.fundId, _params.investor, token0, token1, amount0, amount1);
    }

    function decreaseLiquidity(ILiquidityRouter.DecreaseParams calldata _params) 
        external override lock returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == tokenIdOwner[_params.tokenId] || msg.sender == manager[_params.fundId], 'NA');
        require(_params.investor == tokenIdOwner[_params.tokenId], 'NI');

        (amount0, amount1) = ILiquidityRouter(liquidityRouter).decrease(_params);

        (address token0, address token1) = ILiquidityRouter(liquidityRouter).getLiquidityToken(_params.tokenId);
        increaseToken(fundTokens[_params.fundId], token0, amount0);
        increaseToken(fundTokens[_params.fundId], token1, amount1);
        increaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        increaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit DecreaseLiquidity(_params.fundId, _params.investor, token0, token1, amount0, amount1);
    }
}