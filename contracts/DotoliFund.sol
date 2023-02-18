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

    uint256 public fundIdCount = 0;

    mapping(address => uint256) public managingFund;
    mapping(address => mapping(uint256 => uint256)) public investingFunds;
    mapping(address => uint256) public investingFundCount;

    mapping(uint256 => address) public manager;                             // manager[fundId]
    mapping(uint256 => Token[]) public fundTokens;                          // fundTokens[fundId]
    mapping(uint256 => Token[]) public feeTokens;                           // feeTokens[fundId]
    mapping(uint256 => mapping(address => Token[])) public investorTokens;  // investorTokens[fundId][investor]
    mapping(uint256 => mapping(address => uint256[])) public tokenIds;        // tokenIds[fundId][investor]
    mapping(uint256 => address) public tokenIdOwner;                        // tokenIdOwner[tokenId] => owner of uniswap v3 liquidity position

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address _factory, address _weth9, address _router) {
        factory = _factory;
        weth9 = _weth9;
        router = _router;
        emit FundCreated();
    }

    // function getFundTokens(uint256 fundId) external override view returns (Token[] memory) {
    //     return getTokens(fundTokens[fundId]);
    // }
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
        emit Deposit(msg.sender, weth9, amount);
    }

    receive() external payable {
        if (msg.sender == weth9) {
            // when call IWETH9(weth9).withdraw(amount) in this contract, go into here.
        } else {
            // when deposit ETH with no data
        }
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

    function createFund() external override returns (uint256 fundId) {
        require(managingFund[msg.sender] == 0, 'EXISTS');
        fundId = ++fundIdCount;
        managingFund[msg.sender] = fundId;
        uint256 fundCount = investingFundCount[msg.sender];
        investingFunds[msg.sender][fundCount] = fundId;
        investingFundCount[msg.sender] += 1;
        manager[fundId] = msg.sender;
        emit NewFund(fundId, msg.sender);
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
        emit Subscribe(fundId, msg.sender);
    }

    function deposit(uint256 fundId, address _token, uint256 _amount) external payable override lock {
        bool isWhiteListToken = IDotoliFactory(factory).whiteListTokens(_token);
        require(isSubscribed(msg.sender, fundId), 'US');
        require(isWhiteListToken, 'NWT');

        IERC20Minimal(_token).transferFrom(msg.sender, address(this), _amount);
        increaseToken(fundTokens[fundId], _token, _amount);
        increaseToken(investorTokens[fundId][msg.sender], _token, _amount);
        emit Deposit(msg.sender, _token, _amount);
    }

    function withdraw(uint256 fundId, address _token, uint256 _amount) external payable override lock {
        uint256 tokenAmount = getTokenAmount(investorTokens[fundId][msg.sender], _token);
        require(isSubscribed(msg.sender, fundId), 'US');
        require(tokenAmount >= _amount, 'NET');
        decreaseToken(investorTokens[fundId][msg.sender], _token, _amount);
        uint256 feeAmount = 0;
        uint256 withdrawAmount = 0;
        uint256 managerFee = IDotoliFactory(factory).managerFee();
        if (msg.sender == manager[fundId]) {
            // manager withdraw is no need manager fee
            feeAmount = 0;
            withdrawAmount = _amount;
            _withdraw(_token, _amount);
            decreaseToken(fundTokens[fundId], _token, _amount);
        } else {
            // send manager fee.
            feeAmount = _amount * managerFee / 10000 / 100;
            withdrawAmount = _amount - feeAmount;
            _withdraw(_token, withdrawAmount);
            decreaseToken(fundTokens[fundId], _token, withdrawAmount);
            // deposit fee
            increaseToken(feeTokens[fundId], _token, feeAmount);
            emit DepositFee(msg.sender, _token, feeAmount);
        }
        emit Withdraw(msg.sender, _token, withdrawAmount, feeAmount);
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
        emit Swap(investor, swapFrom, swapTo, swapFromAmount, swapToAmount);
    }

    function swap(IRouter.SwapParams[] calldata trades) external payable override lock {
        for(uint256 i=0; i<trades.length; i++) {
            IRouter.SwapParams memory param = trades[i];
            require(msg.sender == manager[param.fundId], 'NM');

            if (param.swapType == IRouter.SwapType.EXACT_INPUT_SINGLE_HOP) {
                require(IDotoliFactory(factory).whiteListTokens(param.tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(param.fundId, param.investor, param.tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(param.tokenIn).approve(router, param.amountIn);

                uint256 amountOut = IRouter(router).swapRouter(param);
                handleSwap(param.fundId, param.investor, param.tokenIn, param.tokenOut, param.amountIn, amountOut);

            } else if (param.swapType == IRouter.SwapType.EXACT_INPUT_MULTI_HOP) {
                address tokenOut = IRouter(router).getLastTokenFromPath(param.path);
                (address tokenIn, , ) = param.path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(param.fundId, param.investor, tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(tokenIn).approve(router, param.amountIn);

                uint256 amountOut = IRouter(router).swapRouter(param);
                handleSwap(param.fundId, param.investor, tokenIn, tokenOut, param.amountIn, amountOut);

            } else if (param.swapType == IRouter.SwapType.EXACT_OUTPUT_SINGLE_HOP) {
                require(IDotoliFactory(factory).whiteListTokens(param.tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(param.fundId, param.investor, param.tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(param.tokenIn).approve(router, param.amountInMaximum);

                uint256 amountIn = IRouter(router).swapRouter(param);
                handleSwap(param.fundId, param.investor, param.tokenIn, param.tokenOut, amountIn, param.amountOut);

            } else if (param.swapType == IRouter.SwapType.EXACT_OUTPUT_MULTI_HOP) {
                address tokenIn = IRouter(router).getLastTokenFromPath(param.path);
                (address tokenOut, , ) = param.path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(param.fundId, param.investor, tokenIn);
                require(param.amountInMaximum <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(tokenIn).approve(router, param.amountInMaximum);

                uint256 amountIn = IRouter(router).swapRouter(param);
                handleSwap(param.fundId, param.investor, tokenIn, tokenOut, amountIn, param.amountOut);
            }
        }
    }

    function withdrawFee(uint256 fundId, address token, uint256 amount) external payable override lock {
        require(msg.sender == manager[fundId], 'NM');
        bool isSuccess = decreaseToken(feeTokens[fundId], token, amount);
        if (isSuccess) {
            _withdraw(token, amount);
            decreaseToken(fundTokens[fundId], token, amount);
        }
        emit WithdrawFee(token, amount);
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
        require(msg.sender == manager[_params.fundId], 'NM');

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = getInvestorTokenAmount(_params.fundId, _params.investor, _params.token0);
        uint256 token1Balance = getInvestorTokenAmount(_params.fundId, _params.investor, _params.token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(_params.token0).approve(router, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(router, _params.amount1Desired);

        (tokenId, liquidity, amount0, amount1) = IRouter(router).mint(_params);

        (address token0, address token1) = IRouter(router).getLiquidityToken(tokenId);
        decreaseToken(fundTokens[_params.fundId], token0, amount0);
        decreaseToken(fundTokens[_params.fundId], token1, amount1);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        tokenIdOwner[tokenId] = _params.investor;
        tokenIds[_params.fundId][_params.investor].push(tokenId);

        emit MintNewPosition(_params.investor, token0, token1, amount0, amount1);
    }

    function increaseLiquidity(IRouter.IncreaseParams calldata _params) 
        external override returns (uint128 liquidity, uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == manager[_params.fundId], 'NM');
        require(_params.investor == tokenIdOwner[_params.tokenId], 'NI');

        (address token0, address token1) = IRouter(router).getLiquidityToken(_params.tokenId);

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = getInvestorTokenAmount(_params.fundId, _params.investor, token0);
        uint256 token1Balance = getInvestorTokenAmount(_params.fundId, _params.investor, token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(token0).approve(router, _params.amount0Desired);
        IERC20Minimal(token1).approve(router, _params.amount1Desired);
        
        (liquidity, amount0, amount1) = IRouter(router).increase(_params);

        decreaseToken(fundTokens[_params.fundId], token0, amount0);
        decreaseToken(fundTokens[_params.fundId], token1, amount1);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit IncreaseLiquidity(_params.investor, token0, token1, amount0, amount1);
    }

    function collectPositionFee(IRouter.CollectParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == tokenIdOwner[_params.tokenId] || msg.sender == manager[_params.fundId], 'NA');
        require(_params.investor == tokenIdOwner[_params.tokenId], 'NI');
        
        (amount0, amount1) = IRouter(router).collect(_params);

        (address token0, address token1) = IRouter(router).getLiquidityToken(_params.tokenId);
        increaseToken(fundTokens[_params.fundId], token0, amount0);
        increaseToken(fundTokens[_params.fundId], token1, amount1);
        increaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        increaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit CollectPositionFee(_params.investor, token0, token1, amount0, amount1);
    }

    function decreaseLiquidity(IRouter.DecreaseParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == tokenIdOwner[_params.tokenId] || msg.sender == manager[_params.fundId], 'NA');
        require(_params.investor == tokenIdOwner[_params.tokenId], 'NI');

        (amount0, amount1) = IRouter(router).decrease(_params);

        (address token0, address token1) = IRouter(router).getLiquidityToken(_params.tokenId);
        increaseToken(fundTokens[_params.fundId], token0, amount0);
        increaseToken(fundTokens[_params.fundId], token1, amount1);
        increaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        increaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit DecreaseLiquidity(_params.investor, token0, token1, amount0, amount1);
    }
}